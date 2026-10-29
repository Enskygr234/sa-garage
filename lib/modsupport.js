'use strict';
// Mod desteği: Ultimate ASI Loader (ThirteenAG) + Mod Loader (LINK/2012) kurulumu.
// İkisi de açık kaynak ve GitHub sürümlerinden indirilir.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const archive = require('./archive');

const UA = { 'User-Agent': 'SA-Garage-Launcher', Accept: 'application/vnd.github+json' };

async function latestAsset(repo, pick) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: UA });
  if (!r.ok) throw new Error(`${repo} sürüm bilgisi alınamadı (HTTP ${r.status}).`);
  const j = await r.json();
  const asset = pick(j.assets || []);
  if (!asset) throw new Error(`${repo} için uygun indirme dosyası bulunamadı.`);
  return { url: asset.browser_download_url, name: asset.name, tag: j.tag_name };
}

async function download(url, file) {
  const r = await fetch(url, { headers: { 'User-Agent': UA['User-Agent'] }, redirect: 'follow' });
  if (!r.ok) throw new Error(`İndirme başarısız (HTTP ${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fsp.writeFile(file, buf);
  return buf.length;
}

async function findFile(dir, name, depth = 0) {
  if (depth > 6) return null;
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return null; }
  for (const e of entries) if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return path.join(dir, e.name);
  for (const e of entries) if (e.isDirectory()) { const f = await findFile(path.join(dir, e.name), name, depth + 1); if (f) return f; }
  return null;
}

function writeError(e) {
  if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
    return new Error('Oyun klasörüne yazma izni yok. Oyun "Program Files" içindeyse launcher\'ı sağ tık → "Yönetici olarak çalıştır" ile aç ya da oyunu başka bir klasöre taşı.');
  }
  return e;
}

async function install(gameDir, status, onStep) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sagarage-'));
  const done = [];
  try {
    if (!status.asiLoader) {
      onStep && onStep('ASI Loader indiriliyor…');
      const a = await latestAsset('ThirteenAG/Ultimate-ASI-Loader', assets =>
        assets.find(x => x.name === 'Ultimate-ASI-Loader.zip') ||
        assets.find(x => /\.zip$/i.test(x.name) && !/x64|arm/i.test(x.name)));
      const zip = path.join(tmp, 'asi.zip');
      await download(a.url, zip);
      await archive.extract(zip, path.join(tmp, 'asi'));
      const dll = await findFile(path.join(tmp, 'asi'), 'dinput8.dll');
      if (!dll) throw new Error('ASI Loader paketinde dinput8.dll bulunamadı.');
      try { await fsp.copyFile(dll, path.join(gameDir, 'dinput8.dll')); } catch (e) { throw writeError(e); }
      done.push(`Ultimate ASI Loader ${a.tag}`);
    }
    if (!status.modloader) {
      onStep && onStep('Mod Loader indiriliyor…');
      const m = await latestAsset('thelink2012/modloader', assets => assets.find(x => /\.zip$/i.test(x.name)));
      const zip = path.join(tmp, 'ml.zip');
      await download(m.url, zip);
      await archive.extract(zip, path.join(tmp, 'ml'));
      const asi = await findFile(path.join(tmp, 'ml'), 'modloader.asi');
      if (!asi) throw new Error('Mod Loader paketinde modloader.asi bulunamadı.');
      onStep && onStep('Oyun klasörüne kopyalanıyor…');
      try {
        await fsp.copyFile(asi, path.join(gameDir, 'modloader.asi'));
        const folder = path.join(path.dirname(asi), 'modloader');
        if (fs.existsSync(folder)) await fsp.cp(folder, path.join(gameDir, 'modloader'), { recursive: true, force: false, errorOnExist: false });
        else await fsp.mkdir(path.join(gameDir, 'modloader'), { recursive: true });
      } catch (e) { throw writeError(e); }
      done.push(`Mod Loader ${m.tag}`);
    }
    return { ok: true, installed: done };
  } finally {
    fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// Modları geçici olarak kapat/aç: modloader.asi ↔ modloader.asi.off
async function setEnabled(gameDir, enabled) {
  const on = path.join(gameDir, 'modloader.asi');
  const off = path.join(gameDir, 'modloader.asi.off');
  try {
    if (enabled && fs.existsSync(off) && !fs.existsSync(on)) await fsp.rename(off, on);
    if (!enabled && fs.existsSync(on)) await fsp.rename(on, off);
  } catch (e) { throw writeError(e); }
  return fs.existsSync(on);
}

function state(gameDir) {
  return {
    enabled: fs.existsSync(path.join(gameDir, 'modloader.asi')),
    disabled: fs.existsSync(path.join(gameDir, 'modloader.asi.off'))
  };
}

module.exports = { install, setEnabled, state };
