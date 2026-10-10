#!/usr/bin/env node
// precise-edit guard: a PreToolUse hook shared by Claude Code and Codex.
//
// Denies tool calls that would rewrite an existing, non-empty file wholesale
// (Write over an existing file, apply_patch Add/Delete+Add, sed -i, `> file`,
// tee, mv-over, Set-Content/Out-File, read-modify-write scripts) and tells the
// agent to use an exact-match edit instead. It is a guardrail, not a sandbox:
// on any internal error it exits 0 silently and the tool call proceeds.
//
// Usage:
//   node guard.mjs                  read a PreToolUse payload (JSON) on stdin
//   node guard.mjs --session-start  print the editing policy (SessionStart context)
//
// Config: PRECISE_EDIT_MODE=block|warn|off, or a .precise-edit.json file found by
// walking up from the session cwd:
//   { "mode": "block", "allowOverwrite": ["dist/**", "*.snap"],
//     "rewriteThreshold": 0.9, "rewriteMinLines": 40 }

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLICY = [
  'File-editing policy (precise-edit):',
  '- Change existing files only with exact-match edits: the Edit tool (old_string -> new_string) in Claude Code, apply_patch "*** Update File:" hunks in Codex, str_replace elsewhere.',
  '- Never overwrite an existing file wholesale: no Write/create_file over it, no `> file` or `cat <<EOF > file`, no sed -i / perl -pi, tee, Set-Content/Out-File, and no scripts that read-modify-write it.',
  '- Read the target region first. Anchor on a short, unique snippet copied exactly (indentation, tabs, line endings); one logical change per edit.',
  '- If an edit fails, re-read and retry with a better anchor. Do not fall back to rewriting the file.',
  '- Full rewrites are only for new or empty files, or when the user explicitly asks for one.',
].join('\n');

const CONFIG_NAME = '.precise-edit.json';
const MODES = new Set(['block', 'warn', 'off']);
const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

const toSlash = (p) => p.replace(/\\/g, '/');
const normCase = (p) => (CASE_INSENSITIVE ? toSlash(p).toLowerCase() : toSlash(p));

// ---------------------------------------------------------------------------
// Config and paths

export function loadConfig(cwd, env = process.env) {
  const cfg = { mode: 'block', allowOverwrite: [], rewriteThreshold: 0.9, rewriteMinLines: 40, root: path.resolve(cwd) };
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    const file = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(file)) {
      try {
        const user = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (MODES.has(user.mode)) cfg.mode = user.mode;
        if (Array.isArray(user.allowOverwrite)) cfg.allowOverwrite = user.allowOverwrite.filter((g) => typeof g === 'string');
        if (typeof user.rewriteThreshold === 'number') cfg.rewriteThreshold = user.rewriteThreshold;
        if (typeof user.rewriteMinLines === 'number') cfg.rewriteMinLines = user.rewriteMinLines;
      } catch {
        // Malformed config: keep the defaults.
      }
      cfg.root = dir;
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  const envMode = String(env.PRECISE_EDIT_MODE ?? '').trim().toLowerCase();
  if (MODES.has(envMode)) cfg.mode = envMode;
  return cfg;
}

// Resolves a path as written in a command. Returns null for anything that
// cannot be resolved statically (variables, globs, substitutions, devices).
export function resolvePath(raw, cwd) {
  if (typeof raw !== 'string') return null;
  let p = raw.trim();
  if (!p || /[$`*?{}%]/.test(p) || p.startsWith('&') || p.startsWith('/dev/')) return null;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(1));
  if (process.platform === 'win32') {
    const m = /^\/([a-zA-Z])(?:\/(.*))?$/.exec(p); // Git Bash: /c/Users/... -> C:/Users/...
    if (m) p = `${m[1]}:/${m[2] ?? ''}`;
  }
  return path.resolve(cwd, p);
}

function isNonEmptyFile(abs) {
  try {
    const st = fs.statSync(abs);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function tempRoots(env) {
  return [os.tmpdir(), env.TMPDIR, env.TEMP, env.TMP, '/tmp', '/var/tmp', '/private/tmp', '/private/var/folders', '/var/folders']
    .filter(Boolean)
    .map((r) => normCase(path.resolve(r)).replace(/\/+$/, ''));
}

function under(abs, roots) {
  const p = normCase(abs);
  return roots.some((r) => p === r || p.startsWith(`${r}/`));
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, CASE_INSENSITIVE ? 'i' : '');
}

function isAllowed(abs, ctx) {
  // Scratch files in the temp dir are fair game, unless the project itself lives there.
  if (under(abs, ctx.temp) && !under(ctx.cwd, ctx.temp)) return true;
  const rel = toSlash(path.relative(ctx.cfg.root, abs));
  const absSlash = toSlash(abs);
  return ctx.cfg.allowOverwrite.some((g) => {
    const re = globToRegExp(toSlash(g));
    return g.includes('/') ? re.test(rel) || re.test(absSlash) : re.test(path.posix.basename(absSlash));
  });
}

// Returns the absolute path if `raw` names an existing, non-empty file that the
// guard protects; otherwise null.
function protectedFile(raw, ctx) {
  const abs = resolvePath(raw, ctx.cwd);
  return abs && isNonEmptyFile(abs) && !isAllowed(abs, ctx) ? abs : null;
}

function show(abs, ctx) {
  const rel = path.relative(ctx.cwd, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? toSlash(rel) : toSlash(abs);
}

// ---------------------------------------------------------------------------
// POSIX shell

// A small shell tokenizer: enough to find argv, redirections and heredoc
// bodies of each simple command. It does not expand anything.
export function parseShell(src) {
  const cmds = [];
  const newCmd = () => ({ argv: [], redirects: [], heredocs: [], hasHeredoc: false });
  let cur = newCmd();
  let word = null;
  let pendingRedirect = null;
  let pendingHeredocs = [];
  const n = src.length;
  let i = 0;

  const pushWord = () => {
    if (word === null) return;
    if (pendingRedirect?.heredoc) pendingHeredocs.push({ delim: word, strip: pendingRedirect.strip, cmd: cur });
    else if (pendingRedirect) cur.redirects.push({ op: pendingRedirect.op, fd: pendingRedirect.fd, target: word });
    else cur.argv.push(word);
    pendingRedirect = null;
    word = null;
  };
  const endCmd = () => {
    pushWord();
    if (cur.argv.length || cur.redirects.length || cur.hasHeredoc) cmds.push(cur);
    cur = newCmd();
  };

  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] !== '\n') word = (word ?? '') + (src[i + 1] ?? '');
      i += 2;
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j === -1 ? n : j;
      word = (word ?? '') + src.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n && '"\\$`\n'.includes(src[j + 1])) {
          s += src[j + 1];
          j += 2;
        } else s += src[j++];
      }
      word = (word ?? '') + s;
      i = j + 1;
    } else if (c === '\n') {
      endCmd();
      i++;
      for (const h of pendingHeredocs) {
        const lines = [];
        while (i < n) {
          let e = src.indexOf('\n', i);
          if (e === -1) e = n;
          const line = src.slice(i, e);
          i = e + 1;
          const cmp = (h.strip ? line.replace(/^\t+/, '') : line).replace(/\r$/, '');
          if (cmp === h.delim) break;
          lines.push(line);
        }
        h.cmd.heredocs.push(lines.join('\n'));
      }
      pendingHeredocs = [];
    } else if (c === ' ' || c === '\t' || c === '\r') {
      pushWord();
      i++;
    } else if (c === '#' && word === null) {
      const e = src.indexOf('\n', i);
      i = e === -1 ? n : e;
    } else if (c === '&' && src[i + 1] === '>') {
      pushWord(); // &> file, &>> file
      const append = src[i + 2] === '>';
      pendingRedirect = { op: append ? '>>' : '>', fd: null };
      i += append ? 3 : 2;
    } else if (';|&()'.includes(c)) {
      endCmd();
      i += src[i + 1] === c && c !== '(' && c !== ')' ? 2 : 1;
    } else if (c === '<') {
      pushWord();
      if (src[i + 1] === '<' && src[i + 2] === '<') {
        pendingRedirect = { op: '<<<', fd: null };
        i += 3;
      } else if (src[i + 1] === '<') {
        const strip = src[i + 2] === '-';
        pendingRedirect = { heredoc: true, strip };
        cur.hasHeredoc = true;
        i += strip ? 3 : 2;
      } else {
        pendingRedirect = { op: '<', fd: null };
        i += src[i + 1] === '>' ? 2 : 1;
      }
    } else if (c === '>') {
      let fd = null;
      if (word !== null && /^\d+$/.test(word)) {
        fd = word;
        word = null;
      } else pushWord();
      let op = '>';
      let k = i + 1;
      if (src[k] === '>') {
        op = '>>';
        k++;
      } else if (src[k] === '|') k++;
      if (src[k] === '&') {
        let t = '';
        let m = k + 1;
        while (m < n && /[0-9-]/.test(src[m])) t += src[m++];
        if (t) {
          i = m; // fd duplication such as 2>&1, no file involved
          continue;
        }
        k++;
      }
      pendingRedirect = { op, fd };
      i = k;
    } else if (c === '$' && src[i + 1] === '(') {
      let depth = 0;
      let j = i + 1;
      for (; j < n; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')' && --depth === 0) break;
      }
      word = (word ?? '') + src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '`') {
      const j = src.indexOf('`', i + 1);
      const end = j === -1 ? n : j;
      word = (word ?? '') + src.slice(i, end + 1);
      i = end + 1;
    } else {
      word = (word ?? '') + c;
      i++;
    }
  }
  endCmd();
  return cmds;
}

const WRAPPERS = new Set(['sudo', 'doas', 'env', 'command', 'builtin', 'nohup', 'time', 'exec', 'nice', 'xargs']);
const WRAPPER_VALUE_OPTS = { sudo: /^-[ugCDhpRrTt]$/, env: /^-[uSC]$/, nice: /^-n$/, xargs: /^-[IndPLsE]$/ };
const PYTHON = /^(?:python[\d.]*|py|pypy[\d.]*)$/;
const INTERPRETERS = new Set(['node', 'deno', 'bun', 'ruby', 'php']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const POWERSHELLS = new Set(['powershell', 'pwsh']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const progName = (s) => path.basename(toSlash(s)).replace(/\.exe$/i, '').toLowerCase();

function unwrap(argv) {
  const a = [...argv];
  for (;;) {
    while (a.length && ASSIGNMENT.test(a[0])) a.shift();
    if (!a.length || !WRAPPERS.has(progName(a[0]))) return a;
    const w = progName(a.shift());
    while (a.length && (a[0].startsWith('-') || ASSIGNMENT.test(a[0]) || a[0] === '{}')) {
      const opt = a.shift();
      if (WRAPPER_VALUE_OPTS[w]?.test(opt)) a.shift();
    }
  }
}

const quoteSh = (w) => `'${w.replace(/'/g, `'\\''`)}'`;

export function analyzeShell(src, ctx, depth = 0) {
  const found = [];
  for (const cmd of parseShell(src)) {
    const argv = unwrap(cmd.argv);
    const prog = argv.length ? progName(argv[0]) : '';
    const args = argv.slice(1);
    const operands = args.filter((a) => !a.startsWith('-'));

    // In-place editors. If no operand resolves to an existing file (globs,
    // xargs), the targets are unknown and the call is treated as unsafe.
    const inPlace = (label) => {
      const existing = operands.map((o) => resolvePath(o, ctx.cwd)).filter((a) => a && fs.existsSync(a));
      const hits = existing.filter((a) => isNonEmptyFile(a) && !isAllowed(a, ctx));
      if (existing.length === 0 || hits.length) {
        const where = hits.length ? ` (${hits.map((h) => show(h, ctx)).join(', ')})` : '';
        found.push(`\`${label}\` rewrites files in place${where}`);
      }
    };
    if ((prog === 'sed' || prog === 'gsed') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
      inPlace(`${prog} -i`);
    }
    if ((prog === 'perl' || prog === 'ruby') && args.some((a) => /^-[0-9alnpswT]*i/.test(a))) inPlace(`${prog} -i`);
    if ((prog === 'awk' || prog === 'gawk') && args.some((a, k) => a === '-iinplace' || a === '--include=inplace' || ((a === '-i' || a === '--include') && args[k + 1] === 'inplace'))) {
      inPlace(`${prog} -i inplace`);
    }

    if (prog === 'tee' && !args.some((a) => a === '--append' || /^-[a-z]*a/.test(a))) {
      for (const o of operands) {
        const abs = protectedFile(o, ctx);
        if (abs) found.push(`\`tee ${show(abs, ctx)}\` overwrites an existing file`);
      }
    }

    if (prog === 'mv' && operands.length === 2) {
      const abs = protectedFile(operands[1], ctx);
      if (abs) found.push(`\`mv … ${show(abs, ctx)}\` replaces an existing file`);
    }

    for (const r of cmd.redirects) {
      if (r.op === '>' && (r.fd == null || r.fd === '1')) {
        const abs = protectedFile(r.target, ctx);
        if (abs) found.push(`\`> ${show(abs, ctx)}\` overwrites an existing file`);
      }
    }

    if (PYTHON.test(prog) || INTERPRETERS.has(prog)) {
      const k = args.findIndex((a) => a === '-c' || a === '-e' || a === '--eval' || a === '-r');
      const script = [k >= 0 ? args[k + 1] ?? '' : '', ...cmd.heredocs, ...cmd.redirects.filter((r) => r.op === '<<<').map((r) => r.target)].join('\n');
      found.push(...scriptWrites(script, ctx));
    }

    if (depth < 3 && SHELLS.has(prog)) {
      const k = args.findIndex((a) => /^-[a-z]*c$/.test(a));
      if (k >= 0 && args[k + 1]) found.push(...analyzeShell(args[k + 1], ctx, depth + 1));
      for (const h of cmd.heredocs) found.push(...analyzeShell(h, ctx, depth + 1));
    }
    if (depth < 3 && POWERSHELLS.has(prog)) {
      const k = args.findIndex((a) => /^-(?:c|command)$/i.test(a));
      if (k >= 0) found.push(...analyzePowerShell(args.slice(k + 1).join(' '), ctx, depth + 1));
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Inline scripts (python -c, node -e, heredocs, PowerShell here-strings)

// The file argument of a write call: a string literal or a plain identifier.
const ARG = String.raw`\s*(?:(['"\x60])([^'"\x60\n]+)\1|([A-Za-z_$][\w$]*))`;
const WRITE_TARGETS = [
  new RegExp(String.raw`\bopen\s*\(${ARG}\s*,\s*(?:mode\s*=\s*)?['"](?:[wx]|r\+)`, 'g'),
  new RegExp(String.raw`\b(?:writeFile(?:Sync)?|File\.write|file_put_contents|Bun\.write|Deno\.writeTextFile(?:Sync)?)\s*\(${ARG}`, 'g'),
  new RegExp(String.raw`\b(?:os\.replace|shutil\.(?:move|copy\w*))\s*\([^,\n]+,${ARG}`, 'g'),
  new RegExp(String.raw`(?:Path\s*\(${ARG}\s*\)|\b([A-Za-z_$][\w$]*))\s*\.write_(?:text|bytes)\s*\(`, 'g'),
  /\bfileinput\.input\s*\(\s*(['"])([^'"\n]+)\1[^)\n]*inplace\s*=\s*True/g,
];
const ASSIGN_LIT = /\b([A-Za-z_$][\w$]*)\s*=\s*(?:new\s+)?(?:[\w.]*Path\s*\(\s*)?(['"`])([^'"`\n]+)\2/g;

// Flags a script only when a write call targets (directly or via a simple
// variable) an existing file, so scripts that only read, or that create new
// output files, pass.
function scriptWrites(script, ctx) {
  if (!script) return [];
  const vars = new Map();
  for (const m of script.matchAll(ASSIGN_LIT)) vars.set(m[1], m[3]);
  const hits = new Set();
  for (const re of WRITE_TARGETS) {
    for (const m of script.matchAll(re)) {
      for (const g of m.slice(1)) {
        if (!g || /^['"`]$/.test(g)) continue;
        const abs = protectedFile(vars.get(g) ?? g, ctx);
        if (abs) hits.add(show(abs, ctx));
      }
    }
  }
  return [...hits].map((f) => `a script writes the whole of existing file ${f}`);
}

// ---------------------------------------------------------------------------
// PowerShell

function tokenizePowerShell(src) {
  const toks = [];
  const n = src.length;
  let i = 0;
  let word = null;
  const flush = () => {
    if (word !== null) toks.push({ t: 'w', v: word });
    word = null;
  };
  while (i < n) {
    const c = src[i];
    const hereNl = c === '@' && (src[i + 1] === "'" || src[i + 1] === '"') ? (src.startsWith('\r\n', i + 2) ? 2 : src[i + 2] === '\n' ? 1 : 0) : 0;
    if (hereNl) {
      const q = src[i + 1];
      const close = src.indexOf(`\n${q}@`, i + 2);
      const start = i + 2 + hereNl;
      const body = close === -1 ? src.slice(start) : close < start ? '' : src.slice(start, close);
      flush();
      toks.push({ t: 'w', v: body.replace(/\r$/, ''), here: true });
      i = close === -1 ? n : close + 3;
    } else if (c === "'") {
      let j = i + 1;
      let s = '';
      while (j < n) {
        if (src[j] === "'") {
          if (src[j + 1] !== "'") break;
          s += "'";
          j += 2;
        } else s += src[j++];
      }
      word = (word ?? '') + s;
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '`' && j + 1 < n) {
          s += src[j + 1];
          j += 2;
        } else s += src[j++];
      }
      word = (word ?? '') + s;
      i = j + 1;
    } else if (c === '`') {
      word = (word ?? '') + (src[i + 1] ?? '');
      i += 2;
    } else if (c === '#' && word === null) {
      const e = src.indexOf('\n', i);
      i = e === -1 ? n : e;
    } else if (c === ' ' || c === '\t' || c === '\r' || c === ',') {
      flush();
      i++;
    } else if ('\n;|(){}'.includes(c) || (c === '&' && src[i + 1] === '&')) {
      flush();
      toks.push({ t: 'op', v: c });
      i += c === '&' || (c === '|' && src[i + 1] === '|') ? 2 : 1;
    } else if (c === '>') {
      let fd = null;
      if (word !== null && /^(?:\d|\*)$/.test(word)) {
        fd = word;
        word = null;
      } else flush();
      let op = '>';
      let k = i + 1;
      if (src[k] === '>') {
        op = '>>';
        k++;
      }
      if (src[k] === '&') {
        i = k + 2; // 2>&1
        continue;
      }
      toks.push({ t: 'redir', v: op, fd });
      i = k;
    } else {
      word = (word ?? '') + c;
      i++;
    }
  }
  flush();
  return toks;
}

const PS_VALUE_PARAMS = new Set([
  '-path', '-literalpath', '-filepath', '-pspath', '-value', '-encoding', '-inputobject', '-width',
  '-destination', '-itemtype', '-type', '-name', '-filter', '-include', '-exclude', '-stream', '-credential', '-delimiter',
]);

function psArgs(words) {
  const named = {};
  const positional = [];
  const switches = new Set();
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (/^-[A-Za-z]/.test(w)) {
      const key = w.toLowerCase();
      if (PS_VALUE_PARAMS.has(key) && k + 1 < words.length) named[key] = words[++k];
      else switches.add(key);
    } else positional.push(w);
  }
  return { named, positional, switches };
}

const LOOKS_LIKE_PS = /\b(?:Set-Content|Out-File|Add-Content|New-Item|Move-Item|Get-Content)\b|\[(?:System\.)?IO\.File\]::/i;

export function analyzePowerShell(src, ctx, depth = 0) {
  const found = [];
  const toks = tokenizePowerShell(src);
  const heres = toks.filter((t) => t.here).map((t) => t.v);
  const stmts = [[]];
  for (const t of toks) {
    if (t.t === 'op') stmts.push([]);
    else stmts[stmts.length - 1].push(t);
  }
  let unresolvedWrite = false;
  const flagWrite = (target, label) => {
    if (target === undefined) return;
    if (resolvePath(target, ctx.cwd) === null) {
      if (!/^\$null$/i.test(target)) unresolvedWrite = true;
      return;
    }
    const abs = protectedFile(target, ctx);
    if (abs) found.push(`\`${label} ${show(abs, ctx)}\` overwrites an existing file`);
  };

  for (const st of stmts) {
    const words = [];
    const redirs = [];
    for (let k = 0; k < st.length; k++) {
      const t = st[k];
      if (t.t === 'redir') {
        if (st[k + 1]?.t === 'w') redirs.push({ op: t.v, fd: t.fd, target: st[++k].v });
      } else words.push(t.v);
    }
    while (words.length && (words[0] === '&' || words[0] === '.')) words.shift();
    const head = words[0] ?? '';
    const cmd = head.toLowerCase();
    const { named, positional, switches } = psArgs(words.slice(1));

    if ((cmd === 'set-content' || cmd === 'out-file') && !switches.has('-append')) {
      flagWrite(named['-path'] ?? named['-literalpath'] ?? named['-filepath'] ?? named['-pspath'] ?? positional[0], head);
    }
    if (cmd === 'new-item' && switches.has('-force') && !/^dir/i.test(named['-itemtype'] ?? named['-type'] ?? '')) {
      flagWrite(named['-path'] ?? positional[0], 'New-Item -Force');
    }
    if (['move-item', 'mv', 'move', 'mi'].includes(cmd) && switches.has('-force')) {
      flagWrite(named['-destination'] ?? positional[1], 'Move-Item -Force');
    }
    for (const r of redirs) {
      if (r.op === '>' && (r.fd == null || r.fd === '1' || r.fd === '*')) {
        const abs = protectedFile(r.target, ctx);
        if (abs) found.push(`\`> ${show(abs, ctx)}\` overwrites an existing file`);
      }
    }

    const prog = progName(head);
    if (PYTHON.test(prog) || INTERPRETERS.has(prog)) {
      const k = words.findIndex((w) => w === '-c' || w === '-e' || w === '--eval');
      found.push(...scriptWrites([k >= 0 ? words[k + 1] ?? '' : '', ...heres].join('\n'), ctx));
    }
    if (depth < 3 && ['sed', 'gsed', 'perl', 'ruby', 'awk', 'gawk', 'tee', ...SHELLS].includes(prog)) {
      found.push(...analyzeShell(words.map(quoteSh).join(' '), ctx, depth + 1));
    }
  }

  for (const m of src.matchAll(/\[(?:System\.)?IO\.File\]::(WriteAll(?:Text|Lines|Bytes))\s*\(\s*(?:(['"])([^'"]+)\2|(\$[\w:]+))/gi)) {
    flagWrite(m[3] ?? m[4], `[IO.File]::${m[1]}`);
  }

  // Classic read-replace-write on a target we could not resolve (a variable).
  const readsAndReplaces = /\bGet-Content\b|\bReadAll(?:Text|Lines)\b/i.test(src) && /-replace\b|\.Replace\s*\(/i.test(src);
  if (unresolvedWrite && readsAndReplaces) {
    found.push('a read-replace-write pipeline (Get-Content … -replace … | Set-Content) rewrites the whole file');
  }
  return found;
}

// ---------------------------------------------------------------------------
// Codex apply_patch

export function analyzePatch(patch, ctx) {
  const found = [];
  const adds = [];
  const deletes = new Set();
  const updates = [];
  let cur = null;
  for (const line of patch.split(/\r?\n/)) {
    const m = /^\*\*\* (Add|Delete|Update) File: (.+?)\s*$/.exec(line);
    if (m) {
      cur = { kind: m[1], file: m[2], removed: 0 };
      if (m[1] === 'Add') adds.push(cur);
      else if (m[1] === 'Delete') deletes.add(m[2]);
      else updates.push(cur);
    } else if (/^\*\*\* (?:Begin|End) Patch/.test(line)) {
      cur = null;
    } else if (cur?.kind === 'Update' && line.startsWith('-')) {
      cur.removed++;
    }
  }
  for (const a of adds) {
    if (!protectedFile(a.file, ctx)) continue;
    found.push(
      deletes.has(a.file)
        ? `"*** Delete File" + "*** Add File" recreates ${a.file} instead of patching it`
        : `"*** Add File: ${a.file}" would replace an existing file`,
    );
  }
  for (const u of updates) {
    const abs = protectedFile(u.file, ctx);
    if (!abs) continue;
    let total = 0;
    try {
      total = fs.readFileSync(abs, 'utf8').split('\n').length;
    } catch {
      continue;
    }
    if (total >= ctx.cfg.rewriteMinLines && u.removed >= total * ctx.cfg.rewriteThreshold) {
      found.push(`the hunk for ${u.file} removes ${u.removed} of its ${total} lines (a full rewrite in disguise)`);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Entry points

function commandText(input) {
  if (typeof input === 'string') return input;
  const c = input?.command ?? input?.cmd ?? input?.input ?? input?.patch ?? '';
  if (Array.isArray(c)) return c.length >= 3 && /^-(?:l?c|Command)$/i.test(c[1]) ? c.slice(2).join(' ') : c.join(' ');
  return typeof c === 'string' ? c : '';
}

function decision(found, mode, codex) {
  const how = codex
    ? 'apply_patch using "*** Update File:" hunks (only the changed lines plus a few lines of exact context)'
    : 'the Edit tool (old_string -> new_string; replace_all only when every occurrence must change)';
  const text = [
    `precise-edit: ${mode === 'warn' ? 'detected' : 'blocked'} a whole-file rewrite of existing content:`,
    ...found.map((f) => `- ${f}`),
    '',
    `Make the change with ${how}. Read the target region first, anchor on a short unique snippet copied exactly (indentation, tabs, line endings), and make one logical change per edit. If an edit fails, re-read the file and retry with a better anchor instead of rewriting it.`,
    'If the user explicitly asked for a full rewrite, say so and let them allow it (PRECISE_EDIT_MODE=warn, or "allowOverwrite" in .precise-edit.json). Do not edit that config or work around this check yourself.',
  ].join('\n');
  const out = { hookEventName: 'PreToolUse' };
  if (mode === 'warn') out.additionalContext = text;
  else {
    out.permissionDecision = 'deny';
    out.permissionDecisionReason = text;
  }
  return { hookSpecificOutput: out };
}

export function check(payload, env = process.env) {
  const tool = String(payload?.tool_name ?? '');
  const input = payload?.tool_input ?? {};
  const cwd = typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const cfg = loadConfig(cwd, env);
  if (cfg.mode === 'off') return null;
  const ctx = { cwd: path.resolve(cwd), cfg, temp: tempRoots(env) };
  const codex = tool === 'apply_patch' || Object.hasOwn(payload ?? {}, 'turn_id');

  let found = [];
  if (tool === 'Write' || tool === 'create_file') {
    const abs = protectedFile(input.file_path ?? input.path, ctx);
    if (abs) found.push(`Write would replace the entire existing file ${show(abs, ctx)}`);
  } else if (tool === 'apply_patch') {
    found = analyzePatch(commandText(input), ctx);
  } else if (tool === 'Bash' || tool === 'shell' || tool === 'exec_command') {
    const cmd = commandText(input);
    found = analyzeShell(cmd, ctx);
    if (LOOKS_LIKE_PS.test(cmd)) found.push(...analyzePowerShell(cmd, ctx));
  } else if (tool === 'PowerShell') {
    found = analyzePowerShell(commandText(input), ctx);
  }
  found = [...new Set(found)];
  return found.length ? decision(found, cfg.mode, codex) : null;
}

async function main() {
  if (process.argv.includes('--session-start')) {
    process.stdout.write(`${POLICY}\n`);
    return;
  }
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  const result = check(JSON.parse(raw));
  if (result) process.stdout.write(JSON.stringify(result));
}

function isMain() {
  try {
    return normCase(fs.realpathSync(process.argv[1])) === normCase(fs.realpathSync(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
}

if (isMain()) {
  // Fail open: never block a tool call because the guard itself broke.
  main().catch(() => {
    process.exitCode = 0;
  });
}
