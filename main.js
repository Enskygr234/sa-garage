'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const game = require('./lib/game');
const modsupport = require('./lib/modsupport');
const { ModLibrary } = require('./lib/mods');
const Store = require('./lib/store');

const SELFTEST = process.env.SAG_SELFTEST || null;
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let store = null;
let library = null;
let backupsDir = null;
const thumbCache = new Map();

function icon() {
  const p = path.join(__dirname, 'build', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1536,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#0d0f12',
    title: 'SA Garage',
    icon: icon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => {
    const { workAreaSize } = require('electron').screen.getPrimaryDisplay();
    if (workAreaSize.width < 1560 || workAreaSize.height < 1020) win.maximize();
    win.show();
  });
  win.on('maximize', () => send('win:state', { maximized: true }));
  win.on('unmaximize', () => send('win:state', { maximized: false }));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }
function journal(kind, title, text, extra) { const e = store.log(kind, title, text, extra); send('journal', e); return e; }

function gameState() {
  const dir = store.settings.gameDir;
  if (!dir) return { ok: false, reason: 'Oyun klasörü seçilmedi.', running: false };
  const s = game.inspect(dir);
  return { ...s, running: game.isRunning() };
}

function thumbData(meta) {
  if (!meta || !meta.thumb) return null;
  const key = meta.id + meta.thumb;
  if (thumbCache.has(key)) return thumbCache.get(key);
  try {
    let img = nativeImage.createFromPath(library.thumbPath(meta));
    if (img.isEmpty()) return null;
    const { width } = img.getSize();
    if (width > 520) img = img.resize({ width: 520, quality: 'good' });
    const url = img.toDataURL();
    thumbCache.set(key, url);
    return url;
  } catch (e) { return null; }
}

async function modList() {
  const { mods, external } = await library.sync(store.settings.gameDir);
  return {
    mods: mods.map(m => ({ ...m, thumbUrl: thumbData(m) })),
    external
  };
}

async function confirm(message, detail, ok = 'Evet', type = 'question') {
  const r = await dialog.showMessageBox(win, { type, buttons: [ok, 'Vazgeç'], defaultId: 0, cancelId: 1, title: 'SA Garage', message, detail });
  return r.response === 0;
}

async function pruneBackups() {
  const list = await game.listBackups(backupsDir);
  const keep = Math.max(3, store.settings.keepBackups || 20);
  for (const b of list.filter(x => /otomatik/i.test(x.label)).slice(keep)) await game.deleteBackup(backupsDir, b.id);
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('win:close', () => win.close());

  ipcMain.handle('store:get', () => ({ settings: store.settings, stats: store.data.stats, journal: store.data.journal }));
  ipcMain.handle('settings:set', (e, patch) => store.set(patch || {}));

  // -------- oyun --------
  ipcMain.handle('game:state', () => gameState());
  ipcMain.handle('game:autodetect', () => game.autodetect().map(d => game.inspect(d)));
  ipcMain.handle('game:setDir', (e, dir) => {
    const s = game.inspect(dir);
    if (s.ok) {
      store.set({ gameDir: dir });
      journal('launcher', 'Oyun klasörü ayarlandı', dir);
    }
    return { ...s, running: game.isRunning() };
  });
  ipcMain.handle('game:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'GTA San Andreas klasörünü seç', properties: ['openDirectory'], defaultPath: store.settings.gameDir || undefined });
    if (r.canceled || !r.filePaths[0]) return null;
    const s = game.inspect(r.filePaths[0]);
    if (!s.ok) {
      await dialog.showMessageBox(win, { type: 'warning', title: 'SA Garage', message: 'Bu klasörde oyun bulunamadı', detail: 'gta_sa.exe dosyasının bulunduğu klasörü seç.' });
      return s;
    }
    store.set({ gameDir: s.dir });
    journal('launcher', 'Oyun klasörü ayarlandı', s.dir);
    return { ...s, running: false };
  });
  ipcMain.handle('game:play', async () => {
    const st = gameState();
    if (!st.ok) return { ok: false, message: st.reason };
    if (await game.externalRunning()) return { ok: false, message: 'Oyun zaten açık görünüyor.' };
    if (store.settings.autoBackup) {
      const b = await game.backupSaves(app.getPath('documents'), backupsDir, 'Oyun öncesi otomatik yedek').catch(() => null);
      if (b && b.ok) pruneBackups().catch(() => {});
    }
    const r = game.launch(st.dir, ({ seconds, error }) => {
      if (!error) {
        store.data.stats.playSeconds += seconds;
        store.data.stats.sessions += 1;
        store.data.stats.lastPlayed = Date.now();
        store.save();
        if (seconds > 60) journal('play', 'Oyun oturumu bitti', `${Math.round(seconds / 60)} dakika oynadın.`);
      }
      send('game:running', false);
      if (win && !win.isDestroyed() && store.settings.afterPlay === 'minimize') { win.restore(); win.focus(); }
    });
    if (r.ok) {
      send('game:running', true);
      if (store.settings.afterPlay === 'minimize') win.minimize();
      if (store.settings.afterPlay === 'close') setTimeout(() => app.quit(), 1500);
    }
    return r;
  });
  ipcMain.handle('game:open', (e, which) => {
    const docs = app.getPath('documents');
    const map = {
      game: store.settings.gameDir,
      user: game.userFilesDir(docs),
      modloader: store.settings.gameDir && path.join(store.settings.gameDir, 'modloader'),
      library: library.root,
      backups: backupsDir
    };
    const p = map[which];
    if (!p || !fs.existsSync(p)) return { ok: false, message: 'Klasör bulunamadı.' };
    shell.openPath(p);
    return { ok: true };
  });
  ipcMain.handle('game:resetSettings', async () => {
    if (!(await confirm('Oyun ayarları sıfırlansın mı?', 'Ekran çözünürlüğü, grafik, ses ve kontrol ayarları varsayılana döner. Kayıtların etkilenmez; mevcut ayar dosyası önce yedeklenir.', 'Sıfırla'))) return { cancelled: true };
    const r = await game.resetSettings(app.getPath('documents'), backupsDir);
    if (r.ok) journal('launcher', 'Oyun ayarları sıfırlandı', 'Oyun bir sonraki açılışta varsayılan ayarlarla başlayacak.');
    return r;
  });

  // -------- mod desteği --------
  ipcMain.handle('modsupport:install', async () => {
    const st = gameState();
    if (!st.ok) return { ok: false, message: st.reason };
    try {
      const r = await modsupport.install(st.dir, st, step => send('progress', step));
      journal('launcher', 'Mod desteği kuruldu', r.installed.length ? r.installed.join(' ve ') + ' oyun klasörüne kuruldu.' : 'Mod desteği zaten kuruluydu.');
      return { ok: true, state: gameState() };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });
  ipcMain.handle('modsupport:toggle', async (e, enabled) => {
    const st = gameState();
    if (!st.ok) return { ok: false, message: st.reason };
    try {
      await modsupport.setEnabled(st.dir, enabled);
      journal('launcher', enabled ? 'Modlar açıldı' : 'Modlar kapatıldı', enabled ? 'Oyun kurulu modlarla açılacak.' : 'Oyun orijinal hâliyle açılacak; modların silinmedi.');
      return { ok: true, state: gameState() };
    } catch (er) { return { ok: false, message: er.message }; }
  });

  // -------- modlar --------
  ipcMain.handle('mods:list', () => modList());
  const importPaths = async paths => {
    const added = [], failed = [];
    for (const p of paths) {
      send('progress', `${path.basename(p)} ekleniyor…`);
      try {
        const m = await library.import(p, step => send('progress', `${path.basename(p)}: ${step}`));
        added.push(m);
        journal('mod', `Yeni mod eklendi: ${m.name}`, m.replaces.length ? `${m.subtitle}. Kurmak için karttaki Kur düğmesine bas.` : `${m.category} · ${m.subtitle}`, { modId: m.id });
      } catch (e) { failed.push({ file: path.basename(p), error: e.message }); }
    }
    send('progress', null);
    return { added, failed };
  };
  ipcMain.handle('mods:import', async (e, mode) => {
    const r = await dialog.showOpenDialog(win, mode === 'folder'
      ? { title: 'Mod klasörünü seç', properties: ['openDirectory', 'multiSelections'] }
      : { title: 'Mod arşivini seç', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Mod arşivleri', extensions: ['zip', 'rar', '7z'] }] });
    if (r.canceled || !r.filePaths.length) return { added: [], failed: [] };
    return importPaths(r.filePaths);
  });
  ipcMain.handle('mods:importPaths', (e, paths) => importPaths((paths || []).filter(p => typeof p === 'string' && fs.existsSync(p))));
  ipcMain.handle('mods:install', async (e, id) => {
    const st = gameState();
    if (!st.ok) return { ok: false, message: st.reason };
    if (!st.modloader) return { ok: false, needSupport: true, message: 'Önce mod desteğini kurman gerekiyor.' };
    if (st.running) return { ok: false, message: 'Oyun açıkken mod kurulamaz.' };
    try {
      const r = await library.install(id, st.dir);
      journal('mod', `${r.meta.name} kuruldu`, r.meta.subtitle, { modId: id });
      return { ok: true, warnings: r.warnings };
    } catch (er) { return { ok: false, message: er.message }; }
  });
  ipcMain.handle('mods:uninstall', async (e, id) => {
    if (game.isRunning()) return { ok: false, message: 'Oyun açıkken mod kaldırılamaz.' };
    try {
      const r = await library.uninstall(id, store.settings.gameDir);
      journal('mod', `${r.meta.name} kaldırıldı`, 'Mod kütüphanede duruyor; istediğin zaman tekrar kurabilirsin.', { modId: id });
      return { ok: true };
    } catch (er) { return { ok: false, message: er.message }; }
  });
  ipcMain.handle('mods:remove', async (e, id) => {
    const m = await library.get(id).catch(() => null);
    if (!m) return { ok: false };
    if (!(await confirm(`${m.name} silinsin mi?`, 'Mod kütüphaneden ve kuruluysa oyundan tamamen kaldırılır.', 'Sil', 'warning'))) return { cancelled: true };
    await library.remove(id, store.settings.gameDir);
    return { ok: true };
  });
  ipcMain.handle('mods:update', (e, id, patch) => library.update(id, patch));
  ipcMain.handle('mods:thumb', async (e, id) => {
    const r = await dialog.showOpenDialog(win, { title: 'Mod görseli seç', properties: ['openFile'], filters: [{ name: 'Görseller', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return library.setThumb(id, r.filePaths[0]);
  });
  ipcMain.handle('mods:adopt', async (e, folder) => {
    const st = gameState();
    if (!st.ok) return { ok: false };
    const m = await library.adopt(folder, st.dir);
    return { ok: true, mod: m };
  });
  ipcMain.handle('mods:openFolder', async (e, id) => {
    const m = await library.get(id).catch(() => null);
    if (!m) return;
    const p = m.installed ? path.join(store.settings.gameDir, 'modloader', m.folderName) : path.join(library.dir(id), 'files');
    if (fs.existsSync(p)) shell.openPath(p);
  });

  // -------- yedekler --------
  ipcMain.handle('saves:get', () => game.listSaves(app.getPath('documents')));
  ipcMain.handle('backup:list', () => game.listBackups(backupsDir));
  ipcMain.handle('backup:create', async () => {
    const r = await game.backupSaves(app.getPath('documents'), backupsDir, 'Elle alınan yedek');
    if (r.ok) journal('backup', 'Kayıtlar yedeklendi', `${r.backup.count} kayıt dosyası güvene alındı.`);
    return r;
  });
  ipcMain.handle('backup:restore', async (e, id) => {
    if (!(await confirm('Bu yedek geri yüklensin mi?', 'Şu anki kayıtların önce otomatik olarak yedeklenir, sonra seçtiğin yedek geri yüklenir.', 'Geri yükle'))) return { cancelled: true };
    const r = await game.restoreBackup(app.getPath('documents'), backupsDir, id);
    if (r.ok) journal('backup', 'Yedek geri yüklendi', `${r.count} dosya geri yüklendi.`);
    return r;
  });
  ipcMain.handle('backup:delete', async (e, id) => {
    if (!(await confirm('Bu yedek silinsin mi?', 'Bu işlem geri alınamaz.', 'Sil', 'warning'))) return { cancelled: true };
    return { ok: await game.deleteBackup(backupsDir, id) };
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('before-quit', () => store && store.flush());
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  app.setAppUserModelId('com.enskygr234.sagarage');
  const data = app.getPath('userData');
  store = new Store(data);
  library = new ModLibrary(path.join(data, 'library'));
  backupsDir = path.join(data, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  // ilk açılışta oyunu kendiliğinden bulmaya çalış
  if (!store.settings.gameDir) {
    const found = game.autodetect();
    if (found[0]) store.set({ gameDir: found[0] });
    if (!store.data.journal.length) store.log('launcher', 'SA Garage\'a hoş geldin!', found[0] ? 'Oyununu buldum; Oyna\'ya basman yeterli.' : 'Başlamak için Ayarlar\'dan oyun klasörünü seç.');
  }
  registerIpc();
  createWindow();
  if (SELFTEST) runSelfTest(SELFTEST);
});

// CI: oyunsuz Windows makinede arayüzü ve mod içe aktarmayı dener
async function runSelfTest(dir) {
  const report = { errors: [] };
  fs.mkdirSync(dir, { recursive: true });
  const step = async (n, f) => { try { report[n] = await f(); } catch (e) { report.errors.push(`${n}: ${e && e.stack || e}`); } };
  await new Promise(r => setTimeout(r, 4000));
  await step('detect', () => game.autodetect());
  if (process.env.SAG_TEST_MOD) {
    await step('import', async () => { const m = await library.import(process.env.SAG_TEST_MOD); journal('mod', `Yeni mod eklendi: ${m.name}`, m.subtitle, { modId: m.id }); return m; });
  }
  if (process.env.SAG_TEST_GAME) {
    await step('setDir', () => { store.set({ gameDir: process.env.SAG_TEST_GAME }); return game.inspect(process.env.SAG_TEST_GAME); });
    await step('support', () => modsupport.install(process.env.SAG_TEST_GAME, game.inspect(process.env.SAG_TEST_GAME)));
    await step('afterSupport', () => game.inspect(process.env.SAG_TEST_GAME));
    if (report.import) await step('install', () => library.install(report.import.id, process.env.SAG_TEST_GAME));
    await step('list', () => library.sync(process.env.SAG_TEST_GAME));
  }
  await win.webContents.executeJavaScript('window.__refresh && window.__refresh()');
  for (const page of ['home', 'mods', 'settings', 'backup']) {
    try {
      await win.webContents.executeJavaScript(`window.__go && window.__go('${page}')`);
      await new Promise(r => setTimeout(r, 2500));
      fs.writeFileSync(path.join(dir, `${page}.png`), (await win.webContents.capturePage()).toPNG());
    } catch (e) { report.errors.push(`shot ${page}: ${e}`); }
  }
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  app.quit();
}
