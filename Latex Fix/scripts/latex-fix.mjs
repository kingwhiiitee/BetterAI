#!/usr/bin/env node

import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const USERSCRIPT = fileURLToPath(new URL('../userscript/chatgpt-latex-fix.user.js', import.meta.url));

const sandbox = {};
vm.runInNewContext(fs.readFileSync(USERSCRIPT, 'utf8'), sandbox, { filename: USERSCRIPT });
export const { tokenize, convert, formatMath } = sandbox.LatexFix;

function main(argv) {
  const opts = { format: 'dollar', recover: true };
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') opts.format = argv[++i];
    else if (a.startsWith('--format=')) opts.format = a.slice(9);
    else if (a === '--no-recover') opts.recover = false;
    else if (a === '-h' || a === '--help') {
      console.log('usage: latex-fix.mjs [--format dollar|bracket] [--no-recover] [file]');
      return 0;
    } else file = a;
  }
  if (!['dollar', 'bracket'].includes(opts.format)) {
    console.error(`latex-fix: unknown --format "${opts.format}" (use dollar or bracket)`);
    return 2;
  }
  const input = fs.readFileSync(file ?? 0, 'utf8');
  process.stdout.write(convert(input, opts));
  return 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
