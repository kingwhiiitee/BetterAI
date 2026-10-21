import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { convert, tokenize } from '../Latex Fix/scripts/latex-fix.mjs';

const CLI = fileURLToPath(new URL('../Latex Fix/scripts/latex-fix.mjs', import.meta.url));
const USERSCRIPT = new URL('../Latex Fix/userscript/chatgpt-latex-fix.user.js', import.meta.url);
const INSTRUCTIONS = new URL('../Latex Fix/chatgpt/custom-instructions.md', import.meta.url);
const SKILL = new URL('../Latex Fix/skills/latex-fix/SKILL.md', import.meta.url);

const math = (s, opts) => tokenize(s, opts).filter((t) => t.type === 'math');

describe('delimiters', () => {
  test('inline \\( \\) becomes $…$ without inner spaces', () => assert.equal(convert('a \\( x + 1 \\) b'), 'a $x + 1$ b'));
  test('display \\[ \\] on its own lines becomes a $$ block', () =>
    assert.equal(convert('Text\n\n\\[\n\\int_0^1 x\\,dx\n\\]\n'), 'Text\n\n$$\n\\int_0^1 x\\,dx\n$$\n'));
  test('display on one line becomes a $$ block on its own lines', () => assert.equal(convert('\\[ a = b \\]'), '$$\na = b\n$$'));
  test('display mid-sentence stays inline $$…$$', () => assert.equal(convert('so \\[a=b\\] holds'), 'so $$a=b$$ holds'));
  test('list indentation is kept', () => assert.equal(convert('- item\n  \\[ x^2 \\]\n'), '- item\n  $$\n  x^2\n  $$\n'));
  test('existing $$ blocks are kept', () => assert.equal(convert('$$\nx\n$$'), '$$\nx\n$$'));
  test('bracket format goes the other way', () => {
    assert.equal(convert('$$y = 2$$ and \\(x\\)', { format: 'bracket' }), '\\[y = 2\\] and \\(x\\)');
    assert.equal(convert('\\[ a \\]', { format: 'bracket' }), '\\[\na\n\\]');
  });
  test('\\\\[2pt] inside an environment does not end the formula', () =>
    assert.equal(convert('\\[ a \\\\[2pt] b \\]'), '$$\na \\\\[2pt] b\n$$'));
  test('escaped backslash before ( is not a delimiter', () => assert.equal(convert('C:\\\\(dir)'), 'C:\\\\(dir)'));
  test('unclosed delimiter is left alone', () => assert.equal(convert('a \\( b\n\nc \\) d'), 'a \\( b\n\nc \\) d'));
  test('empty delimiters are left alone', () => assert.equal(convert('\\(\\) and $$ $$'), '\\(\\) and $$ $$'));
});

describe('code is never touched', () => {
  test('fenced code block', () => {
    const md = '```python\nre.compile(r"\\(\\d+\\)")\n[ x^2 ]\n```\n\\(y\\)';
    assert.equal(convert(md), '```python\nre.compile(r"\\(\\d+\\)")\n[ x^2 ]\n```\n$y$');
  });
  test('tilde fence and longer backtick fence', () => {
    assert.equal(convert('~~~\n\\(a\\)\n~~~'), '~~~\n\\(a\\)\n~~~');
    assert.equal(convert('````\n```\n\\(a\\)\n````'), '````\n```\n\\(a\\)\n````');
  });
  test('inline code', () => assert.equal(convert('use `\\(x\\)` or ``a `\\(b\\)` c`` then \\(z\\)'), 'use `\\(x\\)` or ``a `\\(b\\)` c`` then $z$'));
  test('unclosed fence protects the rest', () => assert.equal(convert('```\n\\(a\\)'), '```\n\\(a\\)'));
});

describe('recovering backslash-stripped math', () => {
  test('[ … ] on one line', () => assert.equal(convert('[ \\frac{a}{b} = c ]'), '$$\n\\frac{a}{b} = c\n$$'));
  test('[ and ] on their own lines', () => assert.equal(convert('[\nx_1 + x_2 = 3\n]\nafter'), '$$\nx_1 + x_2 = 3\n$$\nafter'));
  test('( \\cmd … ) inline', () => assert.equal(convert('so ( \\alpha + \\beta ) holds'), 'so $\\alpha + \\beta$ holds'));
  test('nested parentheses', () => assert.equal(convert('( f(x) = \\sin(x) )'), '$f(x) = \\sin(x)$'));
  test('normal text is left alone', () => {
    for (const s of ['- [ ] todo', '[link text](https://x.y)', '[ see notes ]', 'f(x) and ( a + b )', 'word( \\alpha )', '( x^2 )'])
      assert.equal(convert(s), s, s);
  });
  test('recover: false keeps bare forms', () => assert.equal(convert('[ \\frac{a}{b} ]', { recover: false }), '[ \\frac{a}{b} ]'));
  test('[ … ] needs to be alone on its line', () => assert.equal(convert('see [ x^2 ] here'), 'see [ x^2 ] here'));
});

describe('prices', () => {
  test('$ before a digit is escaped in dollar format', () => assert.equal(convert('costs $5 and $10'), 'costs \\$5 and \\$10'));
  test('already escaped stays single-escaped', () => assert.equal(convert('costs \\$5'), 'costs \\$5'));
  test('bracket format leaves prices alone', () => assert.equal(convert('costs $5', { format: 'bracket' }), 'costs $5'));
  test('prices inside math are untouched', () => assert.equal(convert('\\( $5 \\)'), '$$5$'));
});

describe('DOM tokenizing (userscript render pass)', () => {
  test('finds inline, display and recovered math in one text node', () => {
    const m = math('Energy \\( E = mc^2 \\), then $$x$$ and ( \\alpha )', { markdown: false });
    assert.deepEqual(
      JSON.parse(JSON.stringify(m.map((t) => [t.tex.trim(), t.display]))),
      [['E = mc^2', false], ['x', true], ['\\alpha', false]],
    );
  });
  test('backticks are plain text outside markdown mode', () => assert.equal(math('`\\(x\\)`', { markdown: false }).length, 1));
  test('plain text has no math', () => assert.equal(math('Nothing [here] (really) $5', { markdown: false }).length, 0));
});

describe('CLI', () => {
  const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });
  test('stdin to stdout', () => {
    const r = run([], 'a \\(x\\)\n');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'a $x$\n');
  });
  test('--format bracket', () => assert.equal(run(['--format', 'bracket'], 'a $$x$$').stdout, 'a \\[x\\]'));
  test('--no-recover', () => assert.equal(run(['--no-recover'], '[ x^2 ]').stdout, '[ x^2 ]'));
  test('bad format exits 2', () => assert.equal(run(['--format=word'], '').status, 2));
});

describe('packaging', () => {
  const header = fs.readFileSync(USERSCRIPT, 'utf8').split('// ==/UserScript==')[0];
  test('userscript header', () => {
    assert.match(header, /^\/\/ ==UserScript==/);
    assert.match(header, /@match\s+https:\/\/chatgpt\.com\/\*/);
    assert.match(header, /@require\s+https:\/\/cdnjs\.cloudflare\.com\/\S+katex\.min\.js#sha256=[0-9a-f]{64}\n/);
    assert.match(header, /@grant\s+none/);
  });
  test('custom instruction blocks fit the 1,500-character limit', () => {
    const blocks = [...fs.readFileSync(INSTRUCTIONS, 'utf8').matchAll(/^```text\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);
    assert.equal(blocks.length, 2);
    for (const b of blocks) {
      assert.ok(b.length <= 1500, `${b.length} characters`);
      assert.match(b, /```latex/, 'asks for a copyable LaTeX source block');
    }
  });
  test('skill frontmatter', () => {
    const skill = fs.readFileSync(SKILL, 'utf8');
    assert.match(skill, /^---\nname: latex-fix\ndescription: .{50,1024}\n/);
  });
});
