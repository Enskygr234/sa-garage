'use strict';
// Oyun klasörü bulma, sürüm kontrolü, oyunu başlatma, kayıt dosyaları ve yedekler.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn, execFile } = require('child_process');

const EXE_NAMES = ['gta_sa.exe', 'gta-sa.exe', 'gta_sa_compact.exe'];
// Bilinen 1.0 US yürütülebilir dosya boyutları (mod uyumluluğu için)
const V1_SIZES = new Set([14383616, 14405632, 5189632]);

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }

function findExe(dir) {
  if (!dir || !isDir(dir)) return null;
  for (const n of EXE_NAMES) {
    const p = path.join(dir, n);
    if (isFile(p)) return p;
  }
  return null;
}

function inspect(dir) {
  const exe = findExe(dir);
  if (!exe) return { ok: false, dir, reason: 'Bu klasörde gta_sa.exe bulunamadı.' };
  const size = fs.statSync(exe).size;
  const name = path.basename(exe).toLowerCase();
  let version = 'Bilinmiyor';
  let moddable = true;
  if (name === 'gta-sa.exe') { version = 'Steam / 2.0 ve üstü'; moddable = false; }
  else if (V1_SIZES.has(size)) version = '1.0 (mod uyumlu)';
  else if (name === 'gta_sa.exe') version = 'Klasik sürüm';
  // dinput8.dll (Ultimate ASI Loader) ya da vorbisHooked.dll (Silent's ASI Loader) varsa yükleyici kurulu
  const asiLoader = isFile(path.join(dir, 'dinput8.dll')) || isFile(path.join(dir, 'vorbisHooked.dll'));
  const asiOn = isFile(path.join(dir, 'modloader.asi'));
  const asiOff = isFile(path.join(dir, 'modloader.asi.off'));
  const modloader = (asiOn || asiOff) && isDir(path.join(dir, 'modloader'));
  return { ok: true, dir, exe, exeName: path.basename(exe), size, version, moddable, asiLoader, modloader, modsEnabled: modloader && asiOn };
}

// Yaygın kurulum yerlerini ve Steam kütüphanelerini tara
function autodetect() {
  const candidates = [];
  const drives = 'CDEFGH'.split('').map(d => `${d}:\\`);
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  for (const base of pf) {
    candidates.push(path.join(base, 'Rockstar Games', 'GTA San Andreas'));
    candidates.push(path.join(base, 'Rockstar Games', 'Grand Theft Auto San Andreas'));
    candidates.push(path.join(base, 'Steam', 'steamapps', 'common', 'Grand Theft Auto San Andreas'));
  }
  for (const d of drives) {
    candidates.push(path.join(d, 'Games', 'GTA San Andreas'));
    candidates.push(path.join(d, 'Oyunlar', 'GTA San Andreas'));
    candidates.push(path.join(d, 'GTA San Andreas'));
    candidates.push(path.join(d, 'Program Files (x86)', 'Rockstar Games', 'GTA San Andreas'));
    candidates.push(path.join(d, 'SteamLibrary', 'steamapps', 'common', 'Grand Theft Auto San Andreas'));
  }
  // Steam libraryfolders.vdf
  for (const base of pf) {
    const vdf = path.join(base, 'Steam', 'steamapps', 'libraryfolders.vdf');
    try {
      const txt = fs.readFileSync(vdf, 'utf8');
      for (const m of txt.matchAll(/"path"\s+"([^"]+)"/g)) {
        candidates.push(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps', 'common', 'Grand Theft Auto San Andreas'));
      }
    } catch (e) {}
  }
  const seen = new Set();
  const found = [];
  for (const c of candidates) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (findExe(c)) found.push(c);
  }
  // 1.0 (mod uyumlu) olanı öne al
  found.sort((a, b) => (inspect(b).moddable ? 1 : 0) - (inspect(a).moddable ? 1 : 0));
  return found;
}

// ---------------- çalıştırma ----------------
let running = null; // { proc, start }
function isRunning() { return !!running; }

function launch(dir, onExit) {
  const exe = findExe(dir);
  if (!exe) return { ok: false, message: 'Oyun dosyası bulunamadı. Oyun klasörünü kontrol et.' };
  if (running) return { ok: false, message: 'Oyun zaten açık.' };
  try {
    const proc = spawn(exe, [], { cwd: dir, detached: true, stdio: 'ignore', windowsHide: false });
    const start = Date.now();
    running = { proc, start };
    proc.on('error', () => { running = null; onExit && onExit({ error: true, seconds: 0 }); });
    proc.on('exit', () => {
      const seconds = Math.round((Date.now() - start) / 1000);
      running = null;
      onExit && onExit({ seconds });
    });
    proc.unref();
    return { ok: true };
  } catch (e) {
    running = null;
    return { ok: false, message: 'Oyun başlatılamadı: ' + e.message };
  }
}

// GTA zaten dışarıdan açılmış mı (Windows)
function externalRunning() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(false);
    execFile('tasklist', ['/FI', 'IMAGENAME eq gta_sa.exe', '/NH'], { windowsHide: true }, (err, out) => {
      if (err) return resolve(false);
      resolve(/gta_sa\.exe/i.test(out));
    });
  });
}

// ---------------- kayıtlar ----------------
function userFilesDir(documents) {
  return path.join(documents, 'GTA San Andreas User Files');
}

function listSaves(documents) {
  const dir = userFilesDir(documents);
  const out = [];
  for (let i = 1; i <= 10; i++) {
    const p = path.join(dir, `GTASAsf${i}.b`);
    try {
      const st = fs.statSync(p);
      out.push({ slot: i, file: p, size: st.size, mtime: st.mtimeMs, title: readSaveTitle(p) });
    } catch (e) {}
  }
  return { dir, exists: isDir(dir), saves: out };
}

// Kayıt dosyasının başlığındaki görev adını okumaya çalışır (yoksa boş)
function readSaveTitle(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(200);
    fs.readSync(fd, buf, 0, 200, 0);
    fs.closeSync(fd);
    // "BLOCK" imzasından sonra 100 karakterlik başlık bulunur
    const start = buf.indexOf('BLOCK');
    if (start < 0) return '';
    const raw = buf.slice(start + 5 + 4, start + 5 + 4 + 100);
    const s = raw.toString('latin1').split('\0')[0].replace(/[^\x20-\x7E]/g, '').trim();
    return s.length > 2 ? s : '';
  } catch (e) { return ''; }
}

async function copyFile(a, b) { await fsp.mkdir(path.dirname(b), { recursive: true }); await fsp.copyFile(a, b); }

async function backupSaves(documents, backupsDir, label) {
  const { saves, dir } = listSaves(documents);
  const set = path.join(dir, 'gta_sa.set');
  if (!saves.length && !isFile(set)) return { ok: false, message: 'Yedeklenecek kayıt dosyası bulunamadı.' };
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupsDir, id);
  for (const s of saves) await copyFile(s.file, path.join(target, path.basename(s.file)));
  if (isFile(set)) await copyFile(set, path.join(target, 'gta_sa.set'));
  const meta = { id, created: Date.now(), label: label || 'Elle alınan yedek', count: saves.length, size: saves.reduce((a, s) => a + s.size, 0) };
  await fsp.writeFile(path.join(target, 'yedek.json'), JSON.stringify(meta, null, 2));
  return { ok: true, backup: meta };
}

async function listBackups(backupsDir) {
  let ids = [];
  try { ids = await fsp.readdir(backupsDir); } catch (e) { return []; }
  const out = [];
  for (const id of ids) {
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(backupsDir, id, 'yedek.json'), 'utf8'));
      out.push(meta);
    } catch (e) {}
  }
  return out.sort((a, b) => b.created - a.created);
}

async function restoreBackup(documents, backupsDir, id) {
  const src = path.join(backupsDir, path.basename(id));
  if (!isDir(src)) return { ok: false, message: 'Yedek bulunamadı.' };
  // geri yüklemeden önce mevcut durumu güvenceye al
  await backupSaves(documents, backupsDir, 'Geri yükleme öncesi otomatik yedek').catch(() => {});
  const dir = userFilesDir(documents);
  await fsp.mkdir(dir, { recursive: true });
  const files = (await fsp.readdir(src)).filter(f => /^GTASAsf\d+\.b$/i.test(f) || f === 'gta_sa.set');
  for (const f of files) await fsp.copyFile(path.join(src, f), path.join(dir, f));
  return { ok: true, count: files.length };
}

async function deleteBackup(backupsDir, id) {
  const p = path.join(backupsDir, path.basename(id));
  if (!isDir(p)) return false;
  await fsp.rm(p, { recursive: true, force: true });
  return true;
}

// Görüntü ayarları bozulup oyun açılmazsa: gta_sa.set'i yedekleyip kaldır
async function resetSettings(documents, backupsDir) {
  const set = path.join(userFilesDir(documents), 'gta_sa.set');
  if (!isFile(set)) return { ok: false, message: 'Ayar dosyası zaten yok; oyun varsayılan ayarlarla açılacak.' };
  await backupSaves(documents, backupsDir, 'Ayar sıfırlama öncesi yedek').catch(() => {});
  await fsp.unlink(set);
  return { ok: true };
}

module.exports = { inspect, autodetect, findExe, launch, isRunning, externalRunning, userFilesDir, listSaves, backupSaves, listBackups, restoreBackup, deleteBackup, resetSettings };
