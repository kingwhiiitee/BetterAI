#!/usr/bin/env node
// Builds the upload packages into dist/ (no dependencies, reproducible bytes):
//   dist/precise-edit-skill.zip  the skill folder, for Claude.ai and ChatGPT skill uploads
//   dist/precise-edit.plugin     the full plugin, for Claude Cowork
//   dist/latex-fix-skill.zip     the LaTeX Fix skill, for Claude.ai and ChatGPT skill uploads
//   dist/chatgpt-latex-fix.user.js  the LaTeX Fix userscript
//   dist/latex-fix-converter.html   the LaTeX Fix converter as one self-contained page

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(REPO, 'plugins', 'precise-edit');
const LATEX = path.join(REPO, 'Latex Fix');
const DIST = path.join(REPO, 'dist');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function listFiles(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.name === '.DS_Store') return [];
      return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).replace(/\\/g, '/')];
    });
}

// Minimal ZIP writer (deflate, UTF-8 names, fixed timestamp 2026-01-01 00:00).
function zip(entries) {
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x0314, 4); // made by: UNIX, spec 2.0
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(stored ? 0 : 8, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

function pack(dir, prefix, out) {
  const entries = listFiles(dir).map((rel) => ({ name: prefix + rel, data: fs.readFileSync(path.join(dir, rel)) }));
  fs.writeFileSync(out, zip(entries));
  console.log(`${path.relative(REPO, out)}  (${entries.length} files)`);
}

fs.mkdirSync(DIST, { recursive: true });
pack(path.join(PLUGIN, 'skills', 'precise-edit'), 'precise-edit/', path.join(DIST, 'precise-edit-skill.zip'));
pack(PLUGIN, '', path.join(DIST, 'precise-edit.plugin'));
pack(path.join(LATEX, 'skills', 'latex-fix'), 'latex-fix/', path.join(DIST, 'latex-fix-skill.zip'));

const userscript = fs.readFileSync(path.join(LATEX, 'userscript', 'chatgpt-latex-fix.user.js'), 'utf8');
fs.writeFileSync(path.join(DIST, 'chatgpt-latex-fix.user.js'), userscript);
console.log('dist/chatgpt-latex-fix.user.js');

const TAG = '<script src="../userscript/chatgpt-latex-fix.user.js"></script>';
const page = fs.readFileSync(path.join(LATEX, 'web', 'converter.html'), 'utf8');
if (!page.includes(TAG) || userscript.includes('</script')) throw new Error('cannot inline the userscript into converter.html');
fs.writeFileSync(path.join(DIST, 'latex-fix-converter.html'), page.replace(TAG, () => `<script>\n${userscript}</script>`));
console.log('dist/latex-fix-converter.html');
