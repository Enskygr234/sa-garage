'use strict';
// .zip, .7z ve .rar arşivlerini açar.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

function sevenZipPath() {
  // asar içindeki ikili dosya çalıştırılamaz; paketten çıkarılmış kopyayı kullan
  const p = require('7zip-bin').path7za;
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function run7z(args) {
  return new Promise((resolve, reject) => {
    execFile(sevenZipPath(), args, { windowsHide: true, maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').toString().trim()));
      else resolve(stdout);
    });
  });
}

async function extractRar(file, dest) {
  const { createExtractorFromFile } = require('node-unrar-js');
  const extractor = await createExtractorFromFile({ filepath: file, targetPath: dest });
  const { files } = extractor.extract();
  // üreteci tüketmek dosyaları diske yazar
  for (const f of files) void f;
}

async function extract(file, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const ext = path.extname(file).toLowerCase();
  if (ext === '.rar') {
    try { await extractRar(file, dest); return; } catch (e) { throw new Error('RAR arşivi açılamadı: ' + e.message); }
  }
  await run7z(['x', file, `-o${dest}`, '-y', '-bso0', '-bsp0']);
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  await fsp.cp(src, dest, { recursive: true, force: true, dereference: false });
}

module.exports = { extract, copyDir };
