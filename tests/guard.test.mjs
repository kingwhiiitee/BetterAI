import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { check, globToRegExp, POLICY } from '../plugins/precise-edit/scripts/guard.mjs';

const GUARD = fileURLToPath(new URL('../plugins/precise-edit/scripts/guard.mjs', import.meta.url));
const ENV = {}; // keep PRECISE_EDIT_MODE from the developer's shell out of the tests

let dir;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precise-edit-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\nworld\n');
  fs.writeFileSync(path.join(dir, 'empty.txt'), '');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'app.py'), 'print("hi")\n');
  fs.writeFileSync(path.join(dir, 'big.txt'), Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n'));
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const run = (tool_name, tool_input, extra = {}, env = ENV) => check({ tool_name, tool_input, cwd: dir, ...extra }, env);
const bash = (command) => run('Bash', { command });
const ps = (command) => run('PowerShell', { command });
const patch = (body) => run('apply_patch', { command: `*** Begin Patch\n${body}\n*** End Patch` }, { turn_id: 't1' });
const denied = (r) => r?.hookSpecificOutput?.permissionDecision === 'deny';

describe('Write (Claude Code)', () => {
  test('new file is allowed', () => assert.equal(run('Write', { file_path: path.join(dir, 'new.txt'), content: 'x' }), null));
  test('empty existing file is allowed', () => assert.equal(run('Write', { file_path: path.join(dir, 'empty.txt'), content: 'x' }), null));
  test('overwriting an existing file is denied', () => {
    const r = run('Write', { file_path: path.join(dir, 'a.txt'), content: 'x' });
    assert.ok(denied(r));
    assert.match(r.hookSpecificOutput.permissionDecisionReason, /Edit tool/);
  });
});

describe('modes and config', () => {
  test('PRECISE_EDIT_MODE=off disables the guard', () => {
    assert.equal(run('Write', { file_path: path.join(dir, 'a.txt') }, {}, { PRECISE_EDIT_MODE: 'off' }), null);
  });
  test('PRECISE_EDIT_MODE=warn adds context instead of denying', () => {
    const r = run('Write', { file_path: path.join(dir, 'a.txt') }, {}, { PRECISE_EDIT_MODE: 'warn' });
    assert.equal(r.hookSpecificOutput.permissionDecision, undefined);
    assert.match(r.hookSpecificOutput.additionalContext, /detected/);
  });
  test('allowOverwrite globs in .precise-edit.json', () => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'precise-edit-cfg-'));
    try {
      fs.mkdirSync(path.join(proj, 'dist'));
      fs.writeFileSync(path.join(proj, 'dist', 'out.js'), 'x');
      fs.writeFileSync(path.join(proj, 'x.snap'), 'x');
      fs.writeFileSync(path.join(proj, 'keep.js'), 'x');
      fs.writeFileSync(path.join(proj, '.precise-edit.json'), JSON.stringify({ allowOverwrite: ['dist/**', '*.snap'] }));
      const w = (f) => check({ tool_name: 'Write', tool_input: { file_path: path.join(proj, f) }, cwd: proj }, ENV);
      assert.equal(w('dist/out.js'), null);
      assert.equal(w('x.snap'), null);
      assert.ok(denied(w('keep.js')));
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
  test('globToRegExp', () => {
    assert.ok(globToRegExp('dist/**').test('dist/a/b.js'));
    assert.ok(globToRegExp('**/*.snap').test('a/b/c.snap'));
    assert.ok(globToRegExp('**/*.snap').test('c.snap'));
    assert.ok(!globToRegExp('*.js').test('a/b.js'));
  });
});

describe('Bash', () => {
  test('sed -i is denied', () => assert.ok(denied(bash("sed -i 's/hello/bye/' a.txt"))));
  test('sed -i.bak and --in-place are denied', () => {
    assert.ok(denied(bash("sed -i.bak -e 's/a/b/' a.txt")));
    assert.ok(denied(bash("sed --in-place 's/a/b/' a.txt")));
  });
  test('sed -i on unknown targets (glob/xargs) is denied', () => {
    assert.ok(denied(bash("sed -i 's/a/b/' src/*.py")));
    assert.ok(denied(bash("git ls-files | xargs sed -i 's/a/b/'")));
  });
  test('read-only sed is allowed', () => assert.equal(bash("sed -n '1,5p' a.txt"), null));
  test('perl -pi and awk -i inplace are denied', () => {
    assert.ok(denied(bash("perl -pi -e 's/a/b/' a.txt")));
    assert.ok(denied(bash("gawk -i inplace '{print}' a.txt")));
  });
  test('perl without -i is allowed', () => assert.equal(bash("perl -Mstrict -ne 'print' a.txt"), null));
  test('redirect over an existing file is denied', () => {
    assert.ok(denied(bash("echo hi > a.txt")));
    assert.ok(denied(bash('printf x >| a.txt')));
    assert.ok(denied(bash('cat src/app.py 1> a.txt')));
    assert.ok(denied(bash('npm run build &> a.txt')));
  });
  test('heredoc over an existing file is denied, body is not parsed as commands', () => {
    assert.ok(denied(bash("cat > a.txt <<'EOF'\nsome > text\nEOF")));
    assert.equal(bash("cat > new.txt <<'EOF'\nfoo > a.txt\nsed -i x a.txt\nEOF"), null);
  });
  test('harmless redirects are allowed', () => {
    assert.equal(bash('echo hi > new.txt'), null);
    assert.equal(bash('echo hi >> a.txt'), null);
    assert.equal(bash('ls > /dev/null 2>&1'), null);
    assert.equal(bash('npm test 2> err.log >&2'), null);
    assert.equal(bash('echo x > empty.txt'), null);
  });
  test('temp files are allowed when the project is outside temp', () => {
    const proj = fs.mkdtempSync(path.join(os.homedir(), '.precise-edit-test-'));
    try {
      const tmp = path.join(os.tmpdir(), `precise-edit-scratch-${process.pid}.txt`);
      fs.writeFileSync(tmp, 'x');
      try {
        assert.equal(check({ tool_name: 'Bash', tool_input: { command: `echo y > "${tmp}"` }, cwd: proj }, ENV), null);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
  test('tee without -a is denied, tee -a allowed', () => {
    assert.ok(denied(bash('echo x | tee a.txt')));
    assert.equal(bash('echo x | tee -a a.txt'), null);
  });
  test('mv over an existing file is denied', () => {
    assert.ok(denied(bash("sed 's/a/b/' a.txt > /tmp/x && mv /tmp/x a.txt")));
    assert.equal(bash('mv a.txt src/'), null);
  });
  test('python heredoc that writes back an existing file is denied', () => {
    const script = "python3 - <<'PY'\nfrom pathlib import Path\np = Path('a.txt')\np.write_text(p.read_text().replace('hello', 'bye'))\nPY";
    assert.ok(denied(bash(script)));
  });
  test('python -c that writes back an existing file is denied', () => {
    assert.ok(denied(bash(`python -c "open('src/app.py', 'w').write('x')"`)));
  });
  test('node -e writeFileSync on existing file is denied', () => {
    assert.ok(denied(bash(`node -e "require('fs').writeFileSync('a.txt', 'x')"`)));
  });
  test('scripts that create new files or only read are allowed', () => {
    assert.equal(bash(`python3 -c "open('out.txt', 'w').write(open('a.txt').read())"`), null);
    assert.equal(bash(`python3 -c "print(open('a.txt').read())"`), null);
    assert.equal(bash(`node -e "require('fs').writeFileSync('out.json', require('fs').readFileSync('a.txt'))"`), null);
  });
  test('fileinput inplace and shutil.move over an existing file are denied', () => {
    assert.ok(denied(bash(`python3 -c "import fileinput; [print(l.replace('a','b'), end='') for l in fileinput.input('a.txt', inplace=True)]"`)));
    assert.ok(denied(bash(`python3 -c "import shutil; shutil.move('/tmp/x', 'a.txt')"`)));
  });
  test('nested bash -c and env/sudo wrappers are analysed', () => {
    assert.ok(denied(bash(`bash -lc "sed -i 's/a/b/' a.txt"`)));
    assert.ok(denied(bash(`FOO=1 sudo -u me sed -i 's/a/b/' a.txt`)));
  });
  test('ordinary commands are allowed', () => {
    assert.equal(bash('git status && npm test | tail -n 20'), null);
    assert.equal(bash("rg -n 'hello' . # sed -i"), null);
  });
  test('Git Bash drive paths resolve on Windows', { skip: process.platform !== 'win32' }, () => {
    const p = path.join(dir, 'a.txt').replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    assert.ok(denied(bash(`echo x > ${p}`)));
  });
});

describe('PowerShell', () => {
  test('Set-Content / Out-File over existing file are denied', () => {
    assert.ok(denied(ps("Set-Content -Path a.txt -Value 'x'")));
    assert.ok(denied(ps("'x' | Out-File a.txt -Encoding utf8")));
  });
  test('Set-Content / Out-File for new files are allowed', () => {
    assert.equal(ps("Set-Content new.txt 'x'"), null);
    assert.equal(ps("'x' | Out-File -FilePath new.txt"), null);
    assert.equal(ps("'x' | Out-File a.txt -Append"), null);
  });
  test('Get-Content -replace | Set-Content is denied', () => {
    assert.ok(denied(ps("(Get-Content a.txt) -replace 'hello','bye' | Set-Content a.txt")));
  });
  test('read-replace-write on a variable path is denied', () => {
    assert.ok(denied(ps("$f = 'a.txt'; (Get-Content $f) -replace 'a','b' | Set-Content $f")));
  });
  test('template to new file is allowed', () => {
    assert.equal(ps("(Get-Content a.txt) -replace 'hello','bye' | Set-Content new.txt"), null);
  });
  test('[IO.File]::WriteAllText, New-Item -Force, redirect are denied', () => {
    assert.ok(denied(ps("[System.IO.File]::WriteAllText('a.txt', 'x')")));
    assert.ok(denied(ps('New-Item -ItemType File -Path a.txt -Force')));
    assert.ok(denied(ps("'x' > a.txt")));
  });
  test('appends and $null are allowed', () => {
    assert.equal(ps("Add-Content a.txt 'x'"), null);
    assert.equal(ps("'x' >> a.txt"), null);
    assert.equal(ps('Get-Process > $null'), null);
    assert.equal(ps('New-Item -ItemType Directory -Force out'), null);
  });
  test('python here-string writing back an existing file is denied', () => {
    const cmd = "@'\nfrom pathlib import Path\nPath('a.txt').write_text('x')\n'@ | python -";
    assert.ok(denied(ps(cmd)));
  });
  test('Bash tool running PowerShell syntax (Codex on Windows) is analysed', () => {
    assert.ok(denied(bash("Set-Content -Path a.txt -Value 'x'")));
    assert.ok(denied(bash(`powershell -Command "Set-Content a.txt 'x'"`)));
  });
});

describe('apply_patch (Codex)', () => {
  test('Update File is allowed', () => {
    assert.equal(patch('*** Update File: a.txt\n@@\n-hello\n+bye\n world'), null);
  });
  test('Add File for a new path is allowed', () => {
    assert.equal(patch('*** Add File: new.txt\n+x'), null);
  });
  test('Add File over an existing path is denied, with Codex guidance', () => {
    const r = patch('*** Add File: a.txt\n+x');
    assert.ok(denied(r));
    assert.match(r.hookSpecificOutput.permissionDecisionReason, /apply_patch/);
  });
  test('Delete + Add of the same file is denied', () => {
    assert.ok(denied(patch('*** Delete File: a.txt\n*** Add File: a.txt\n+x')));
  });
  test('an Update hunk that removes nearly every line is denied', () => {
    const removed = Array.from({ length: 50 }, (_, i) => `-line ${i}`).join('\n');
    assert.ok(denied(patch(`*** Update File: big.txt\n@@\n${removed}\n+new`)));
  });
});

describe('process entry point', () => {
  const spawn = (input, args = []) => spawnSync(process.execPath, [GUARD, ...args], { input, encoding: 'utf8', env: { ...process.env, PRECISE_EDIT_MODE: '' } });

  test('prints a deny decision as JSON', () => {
    const r = spawn(JSON.stringify({ tool_name: 'Bash', tool_input: { command: "sed -i 's/a/b/' a.txt" }, cwd: dir }));
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });
  test('prints nothing for an allowed call', () => {
    const r = spawn(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: dir }));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
  test('fails open on malformed input', () => {
    const r = spawn('not json');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
  test('--session-start prints the policy', () => {
    const r = spawn('', ['--session-start']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), POLICY);
  });
});
