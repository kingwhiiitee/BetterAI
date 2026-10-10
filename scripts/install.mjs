#!/usr/bin/env node
// Installs (or removes) precise-edit for Codex and/or Claude Code at user scope.
//
//   node scripts/install.mjs --codex          skill, guard hook, exec rules, AGENTS.md block
//   node scripts/install.mjs --claude-code    skill, guard hook, CLAUDE.md block (no marketplace)
//   node scripts/install.mjs --all
//   add --uninstall to remove, --dry-run to only print what would change
//
// Respects CODEX_HOME and CLAUDE_CONFIG_DIR. Every file it modifies is backed up
// once as <file>.bak-precise-edit. Re-running is safe: entries are replaced, not duplicated.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(REPO, 'plugins', 'precise-edit');
const SKILL_SRC = path.join(PLUGIN, 'skills', 'precise-edit');
const GUARD_SRC = path.join(PLUGIN, 'scripts', 'guard.mjs');
const GUARD_MARK = '/precise-edit/guard.mjs';
const BEGIN = '<!-- BEGIN precise-edit (BetterAI) -->';
const END = '<!-- END precise-edit (BetterAI) -->';

const argv = new Set(process.argv.slice(2));
const dry = argv.has('--dry-run');
const uninstall = argv.has('--uninstall');
const wantCodex = argv.has('--codex') || argv.has('--all');
const wantClaude = argv.has('--claude-code') || argv.has('--all');

if (argv.has('--help') || argv.has('-h') || (!wantCodex && !wantClaude)) {
  console.log('Usage: node scripts/install.mjs [--codex] [--claude-code] [--all] [--uninstall] [--dry-run]');
  process.exit(wantCodex || wantClaude ? 0 : 1);
}

const home = os.homedir();
const codexHome = process.env.CODEX_HOME || path.join(home, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
const agentsHome = path.join(home, '.agents');

const slash = (p) => p.replace(/\\/g, '/');
const log = (action, p) => console.log(`${dry ? '[dry-run] ' : ''}${action.padEnd(7)} ${p}`);

function backupOnce(file) {
  const bak = `${file}.bak-precise-edit`;
  if (fs.existsSync(file) && !fs.existsSync(bak)) {
    log('backup', bak);
    if (!dry) fs.copyFileSync(file, bak);
  }
}

function writeFile(file, text) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return;
  backupOnce(file);
  log('write', file);
  if (!dry) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

function copy(src, dst) {
  log('copy', dst);
  if (dry) return;
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

function remove(p) {
  if (!fs.existsSync(p)) return;
  log('remove', p);
  if (!dry) fs.rmSync(p, { recursive: true, force: true });
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}). Fix it or merge the hook by hand; nothing was changed.`);
  }
}

function writeJson(file, before, obj) {
  const text = `${JSON.stringify(obj, null, 2)}\n`;
  if (JSON.stringify(before) === JSON.stringify(obj)) return;
  writeFile(file, text);
}

// Replaces our hook group for `event` (or removes it when `command` is null),
// leaving every other hook untouched.
function setHook(settings, event, matcher, command, extra = {}) {
  settings.hooks ??= {};
  const groups = (settings.hooks[event] ?? []).filter((g) => !JSON.stringify(g).includes(GUARD_MARK));
  if (command) groups.push({ matcher, hooks: [{ type: 'command', command, timeout: 10, ...extra }] });
  if (groups.length) settings.hooks[event] = groups;
  else delete settings.hooks[event];
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
}

// Inserts, replaces or removes the marked policy block in a Markdown file.
function setBlock(file, blockFile) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = old.replace(new RegExp(`\\s*${esc(BEGIN)}[\\s\\S]*?${esc(END)}`), '').trimEnd();
  if (!blockFile) {
    if (stripped === old.trimEnd()) return;
    if (!stripped) return remove(file);
    return writeFile(file, `${stripped}\n`);
  }
  const block = fs.readFileSync(blockFile, 'utf8').trim();
  if (!block.startsWith(BEGIN)) throw new Error(`${blockFile} must start with ${BEGIN}`);
  writeFile(file, `${stripped ? `${stripped}\n\n` : ''}${block}\n`);
}

function codex() {
  console.log(`\nCodex (${codexHome})`);
  const guard = path.join(codexHome, 'precise-edit', 'guard.mjs');
  const hooksFile = path.join(codexHome, 'hooks.json');
  const hooks = readJson(hooksFile);
  const before = structuredClone(hooks);

  if (uninstall) {
    remove(path.join(agentsHome, 'skills', 'precise-edit'));
    remove(path.dirname(guard));
    remove(path.join(codexHome, 'rules', 'precise-edit.rules'));
    setHook(hooks, 'PreToolUse', null, null);
    writeJson(hooksFile, before, hooks);
    setBlock(path.join(codexHome, 'AGENTS.md'), null);
    return;
  }
  copy(SKILL_SRC, path.join(agentsHome, 'skills', 'precise-edit'));
  copy(GUARD_SRC, guard);
  copy(path.join(REPO, 'platforms', 'codex', 'precise-edit.rules'), path.join(codexHome, 'rules', 'precise-edit.rules'));
  setHook(hooks, 'PreToolUse', 'Bash|apply_patch', `node "${slash(guard)}"`, { statusMessage: 'precise-edit: checking for whole-file rewrites' });
  writeJson(hooksFile, before, hooks);
  setBlock(path.join(codexHome, 'AGENTS.md'), path.join(REPO, 'platforms', 'codex', 'AGENTS.md'));
  console.log('Next: start `codex`, run /hooks and trust the precise-edit hook. Codex skips untrusted hooks.');
}

function claudeCode() {
  console.log(`\nClaude Code (${claudeHome})`);
  const guard = path.join(claudeHome, 'precise-edit', 'guard.mjs');
  const settingsFile = path.join(claudeHome, 'settings.json');
  const settings = readJson(settingsFile);
  const before = structuredClone(settings);

  if (uninstall) {
    remove(path.join(claudeHome, 'skills', 'precise-edit'));
    remove(path.dirname(guard));
    setHook(settings, 'PreToolUse', null, null);
    writeJson(settingsFile, before, settings);
    setBlock(path.join(claudeHome, 'CLAUDE.md'), null);
    return;
  }
  copy(SKILL_SRC, path.join(claudeHome, 'skills', 'precise-edit'));
  copy(GUARD_SRC, guard);
  setHook(settings, 'PreToolUse', 'Write|Bash|PowerShell', `node "${slash(guard)}"`);
  writeJson(settingsFile, before, settings);
  setBlock(path.join(claudeHome, 'CLAUDE.md'), path.join(REPO, 'platforms', 'claude-code', 'CLAUDE.md'));
  console.log('Next: restart Claude Code. If the precise-edit plugin is also installed from the marketplace, keep only one of the two.');
}

try {
  if (wantCodex) codex();
  if (wantClaude) claudeCode();
  console.log(`\n${dry ? 'Dry run finished, nothing was changed.' : uninstall ? 'Uninstalled.' : 'Installed.'}`);
} catch (err) {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
}
