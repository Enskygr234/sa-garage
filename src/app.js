'use strict';
/* SA Garage arayüzü */
const G = window.garage;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  page: 'home',
  game: null,
  store: null,
  mods: [],
  external: [],
  running: false,
  filterState: 'all',
  filterCat: 'Tümü',
  query: ''
};
const VEHICLE_CATS = ['Araç', 'Motosiklet', 'Hava aracı', 'Tekne'];

// ---------------- yardımcılar ----------------
function bytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(3, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0).replace('.', ',')} ${u[i]}`;
}
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function date(t) { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function dateTime(t) { const d = new Date(t); return `${date(t)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function ago(t) {
  if (!t) return '—';
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} saat önce`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} gün önce`;
  return date(t);
}
function duration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
  return h ? `${h} sa ${m} dk` : `${m} dk`;
}
function hash(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

let toastT;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), err ? 6000 : 3200);
}
G.onProgress(msg => {
  const p = $('#progress');
  p.classList.toggle('show', !!msg);
  if (msg) $('span', p).textContent = msg;
});

// ---------------- gezinme ----------------
const TITLES = { home: 'Ana Sayfa', play: 'Oyna', mods: 'Modlar', cars: 'Araç Modları', settings: 'Ayarlar', backup: 'Yedekleme', about: 'Hakkında' };
function go(page) {
  if (!TITLES[page]) return;
  S.page = page;
  $$('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.go === page));
  const target = page === 'cars' ? 'mods' : page;
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${target}`));
  $('.content').scrollTop = 0;
  if (page === 'mods' || page === 'cars') { if (page === 'cars') S.filterCat = 'Araçlar'; else if (S.filterCat === 'Araçlar') S.filterCat = 'Tümü'; renderMods(); }
  if (page === 'backup') loadBackups();
  if (page === 'settings') renderSettings();
  if (page === 'play') renderPlay();
  if (page === 'about') renderJournal();
}
window.__go = go;

document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const a = e.target.closest('[data-action]');
  if (a) { action(a.dataset.action, a); return; }
  if (!e.target.closest('#menu')) closeMenu();
});
$('#btn-min').onclick = () => G.minimize();
$('#btn-close').onclick = () => G.close();
$('.topbar').addEventListener('dblclick', e => { if (!e.target.closest('button')) G.maximize(); });

async function action(name, el) {
  switch (name) {
    case 'play': return play();
    case 'open-game': return openFolder('game');
    case 'open-user': return openFolder('user');
    case 'open-modloader': return openFolder('modloader');
    case 'open-library': return openFolder('library');
    case 'open-backups': return openFolder('backups');
    case 'backup': return doBackup();
    case 'import': return importMods('file');
    case 'import-folder': return importMods('folder');
    case 'choose': { const s = await G.chooseGame(); if (s && s.ok) { S.game = s; toast('Oyun klasörü kaydedildi ✓'); refreshAll(); } return; }
    case 'autodetect': return autodetect();
    case 'use-detected': { const s = await G.setGameDir(el.dataset.dir); if (s.ok) { S.game = s; $('#detect-list').innerHTML = ''; toast('Oyun klasörü kaydedildi ✓'); refreshAll(); } return; }
    case 'reset-settings': { const r = await G.resetSettings(); if (r.cancelled) return; toast(r.ok ? 'Oyun ayarları sıfırlandı ✓' : r.message, !r.ok); return; }
    case 'install-support': return installSupport();
    case 'toggle-mods': return toggleMods(el.dataset.on === '1');
    case 'adopt': { const r = await G.adoptMod(el.dataset.folder); if (r.ok) { toast(`${r.mod.name} kütüphaneye alındı ✓`); loadMods(); } return; }
    case 'restore': { const r = await G.restore(el.dataset.id); if (r.cancelled) return; toast(r.ok ? 'Yedek geri yüklendi ✓' : r.message, !r.ok); loadBackups(); return; }
    case 'delete-backup': { const r = await G.deleteBackup(el.dataset.id); if (r.ok) loadBackups(); return; }
  }
}

async function openFolder(which) {
  const r = await G.open(which);
  if (!r.ok) toast(r.message || 'Klasör bulunamadı', true);
}

// ---------------- oyun ----------------
async function play() {
  if (S.running) { toast('Oyun zaten açık.'); return; }
  if (!S.game || !S.game.ok) { toast('Önce oyun klasörünü seç.', true); go('settings'); return; }
  const r = await G.play();
  if (!r.ok) toast(r.message, true);
}
G.onRunning(on => { S.running = on; renderGameState(); if (!on) refreshStore(); });

function renderGameState() {
  const g = S.game;
  const st = $('#sb-state');
  st.className = '';
  $$('.play-btn').forEach(b => { b.classList.toggle('running', S.running); b.classList.toggle('disabled', !g || !g.ok); $('span', b).textContent = S.running ? 'OYUNDA' : 'OYNA'; });
  if (S.running) { st.classList.add('running'); st.innerHTML = '<i></i>Oyunda'; }
  else if (g && g.ok) { st.classList.add('ok'); st.innerHTML = '<i></i>Hazır'; }
  else { st.classList.add('bad'); st.innerHTML = '<i></i>Klasör seçilmedi'; }
  $('#sb-dir').textContent = g && g.ok ? g.dir : 'Ayarlar\'dan oyun klasörünü seç';
  $('#sb-dir').title = g && g.dir || '';
  $('#tile-folder').textContent = g && g.ok ? g.dir : 'Seçilmedi';
  $('#sb-edition').textContent = g && g.ok ? `${g.version} · PC` : 'Klasik Sürüm (PC)';
  const installed = S.mods.filter(m => m.installed).length + S.external.length;
  $('#sb-mods').textContent = `${installed} adet`;
  if ($('#st-mods')) $('#st-mods').textContent = installed;
}

async function autodetect() {
  $('#detect-list').innerHTML = '<p class="empty">Aranıyor…</p>';
  const list = await G.autodetect();
  $('#detect-list').innerHTML = list.length ? list.map(s => `
    <div class="detect"><small>${esc(s.dir)}<br><span class="${s.moddable ? '' : 'orange'}">${esc(s.version)}</span></small><button class="btn orange" data-action="use-detected" data-dir="${esc(s.dir)}">Kullan</button></div>`).join('')
    : '<p class="empty">Bilinen yerlerde bulunamadı. Değiştir\'e basıp gta_sa.exe\'nin olduğu klasörü seç.</p>';
}

async function installSupport() {
  const r = await G.installSupport();
  if (r.ok) { S.game = r.state; toast('Mod desteği kuruldu ✓'); refreshAll(); }
  else toast(r.message, true);
}
async function toggleMods(on) {
  const r = await G.toggleMods(on);
  if (r.ok) { S.game = r.state; toast(on ? 'Modlar açıldı' : 'Modlar kapatıldı; oyun orijinal hâliyle açılacak'); refreshAll(); }
  else toast(r.message, true);
}

// ---------------- modlar ----------------
async function loadMods() {
  const r = await G.mods();
  S.mods = r.mods;
  S.external = r.external;
  renderHomeMods();
  if (S.page === 'mods' || S.page === 'cars') renderMods();
  renderGameState();
}

function modImg(m) {
  if (m.thumbUrl) return `<img src="${m.thumbUrl}" alt="">`;
  return Art.thumb(hash(m.id || m.name) % 4, m.color || '#9ca3af', VEHICLE_CATS.includes(m.category) || m.category === 'Diğer');
}

function modCard(m) {
  const sub = [m.category, m.subtitle].filter(Boolean).join(' - ');
  const badge = m.installed
    ? `<button class="badge installed" data-mod-act="uninstall" data-id="${m.id}" title="Kaldırmak için tıkla">Kurulu</button>`
    : `<button class="badge install" data-mod-act="install" data-id="${m.id}">Kur</button>`;
  return `<div class="mod-card" data-id="${m.id}">
    <div class="mod-img">${modImg(m)}${m.replaces && m.replaces.length > 1 ? `<span class="mod-tag">${m.replaces.length} araç</span>` : ''}</div>
    <div class="mod-body">
      <b title="${esc(m.name)}">${esc(m.name)}</b>
      <small title="${esc(sub)}">${esc(sub)}</small>
      <div class="mod-foot">${badge}${m.installed ? '' : '<span class="badge library" style="display:none"></span>'}<button class="dots" data-menu="${m.id}"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button></div>
    </div>
  </div>`;
}

const addCard = `<div class="empty-card" data-action="import"><div><span class="plus">+</span><b>Mod ekle</b><small>.zip, .rar, .7z dosyasını seç<br>ya da buraya sürükle</small></div></div>`;

function renderHomeMods() {
  const cars = S.mods.filter(m => VEHICLE_CATS.includes(m.category)).slice(0, 4);
  const list = cars.length ? cars : S.mods.slice(0, 4);
  $('#home-mods').innerHTML = list.map(modCard).join('') + (list.length < 4 ? addCard : '');
}

function renderMods() {
  const isCars = S.page === 'cars';
  $('#mods-title').textContent = isCars ? 'Araç Modları' : 'Modlar';
  const g = S.game;
  // mod desteği uyarısı
  const banner = $('#support-banner');
  if (g && g.ok && !g.modloader) {
    banner.innerHTML = `<span class="ic">⚙</span><div><b>Mod desteği henüz kurulu değil</b><small>${g.moddable ? 'Modların çalışması için Mod Loader ve ASI Loader oyun klasörüne kurulmalı. Tek tıkla kurabilirsin.' : 'Bu oyun sürümü (Steam/2.0) çoğu modla uyumsuz. Yine de kurabilirsin ama modlar çalışmayabilir; 1.0 sürümü önerilir.'}</small></div><button class="btn orange" data-action="install-support">Mod desteğini kur</button>`;
    banner.classList.add('show');
  } else if (g && g.ok && g.modloader && !g.modsEnabled) {
    banner.innerHTML = `<span class="ic">⏸</span><div><b>Modlar kapalı</b><small>Oyun şu an orijinal hâliyle açılıyor. Kurulu modların silinmedi.</small></div><button class="btn orange" data-action="toggle-mods" data-on="1">Modları aç</button>`;
    banner.classList.add('show');
  } else if (!g || !g.ok) {
    banner.innerHTML = `<span class="ic">!</span><div><b>Oyun klasörü seçilmedi</b><small>Modları kütüphaneye ekleyebilirsin ama kurmak için önce oyun klasörünü seçmelisin.</small></div><button class="btn orange" data-go="settings">Klasörü seç</button>`;
    banner.classList.add('show');
  } else banner.classList.remove('show');

  // kategori düğmeleri
  const cats = ['Tümü', 'Araçlar', ...new Set(S.mods.map(m => m.category).filter(c => !VEHICLE_CATS.includes(c)))];
  if (!cats.includes(S.filterCat)) S.filterCat = 'Tümü';
  $('#filter-cat').innerHTML = cats.map(c => `<button class="${c === S.filterCat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');

  const q = S.query.toLowerCase();
  const list = S.mods.filter(m =>
    (S.filterState === 'all' || (S.filterState === 'installed') === !!m.installed) &&
    (S.filterCat === 'Tümü' || (S.filterCat === 'Araçlar' ? VEHICLE_CATS.includes(m.category) : m.category === S.filterCat)) &&
    (!q || `${m.name} ${m.subtitle} ${(m.replaces || []).map(r => r.name).join(' ')}`.toLowerCase().includes(q)));
  $('#mod-grid').innerHTML = list.map(modCard).join('') + (!q ? addCard : '') || '<p class="empty">Aramana uyan mod yok.</p>';

  const ext = S.external.filter(m => !isCars || VEHICLE_CATS.includes(m.category));
  $('#external').innerHTML = ext.length ? `<h4>MODLOADER KLASÖRÜNDE ELLE KURULMUŞ MODLAR</h4>` + ext.map(m => `
    <div class="ext-row"><div><b>${esc(m.name)}</b><br><small>${esc(m.category)} · ${esc(m.subtitle)} · ${bytes(m.size)}</small></div>
    <button class="btn ghost" data-action="adopt" data-folder="${esc(m.folderName)}">Kütüphaneye al</button></div>`).join('') : '';
}

$('#filter-state').addEventListener('click', e => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  S.filterState = b.dataset.f;
  $$('#filter-state button').forEach(x => x.classList.toggle('active', x === b));
  renderMods();
});
$('#filter-cat').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  S.filterCat = b.dataset.cat;
  renderMods();
});
$('#mod-search').addEventListener('input', e => { S.query = e.target.value; renderMods(); });

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-mod-act]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.modAct === 'install') await installMod(id);
  else if (b.dataset.modAct === 'uninstall') await uninstallMod(id);
});

async function installMod(id) {
  const r = await G.installMod(id);
  if (r.ok) {
    toast('Mod kuruldu ✓ Oyunu açınca aktif olacak.');
    (r.warnings || []).forEach((w, i) => setTimeout(() => toast(w, true), 3300 * (i + 1)));
  } else if (r.needSupport) {
    toast(r.message, true);
    if (S.page !== 'mods') go('mods');
  } else toast(r.message, true);
  loadMods();
}
async function uninstallMod(id) {
  const r = await G.uninstallMod(id);
  if (r.ok) toast('Mod kaldırıldı; kütüphanede duruyor.');
  else toast(r.message, true);
  loadMods();
}

// ⋮ menüsü
function closeMenu() { $('#menu').classList.remove('show'); }
document.addEventListener('click', e => {
  const d = e.target.closest('[data-menu]');
  if (!d) return;
  e.stopPropagation();
  const m = S.mods.find(x => x.id === d.dataset.menu);
  if (!m) return;
  const menu = $('#menu');
  menu.innerHTML = `
    ${m.installed ? `<button data-m="uninstall">Oyundan kaldır</button>` : `<button data-m="install">Oyuna kur</button>`}
    <button data-m="edit">Düzenle</button>
    <button data-m="thumb">Görseli değiştir</button>
    <button data-m="folder">Dosyaları göster</button>
    <hr><button data-m="remove" class="danger">Sil</button>`;
  menu.classList.add('show');
  const r = d.getBoundingClientRect();
  menu.style.left = `${Math.min(window.innerWidth - 200, r.left - 160)}px`;
  menu.style.top = `${Math.min(window.innerHeight - 220, r.bottom + 6)}px`;
  menu.onclick = async ev => {
    const k = ev.target.closest('[data-m]');
    if (!k) return;
    closeMenu();
    const act = k.dataset.m;
    if (act === 'install') installMod(m.id);
    if (act === 'uninstall') uninstallMod(m.id);
    if (act === 'folder') G.openMod(m.id);
    if (act === 'thumb') { const r2 = await G.setModThumb(m.id); if (r2) loadMods(); }
    if (act === 'remove') { const r2 = await G.removeMod(m.id); if (r2.ok) { toast('Mod silindi'); loadMods(); } }
    if (act === 'edit') editMod(m);
  };
});

function editMod(m) {
  const cats = ['Araç', 'Motosiklet', 'Hava aracı', 'Tekne', 'Skin', 'Script', 'Model', 'Diğer'];
  $('#modal-title').textContent = 'Modu düzenle';
  $('#modal-body').innerHTML = `
    <label>Ad</label><input id="ed-name" maxlength="60" value="${esc(m.name)}">
    <label>Alt başlık</label><input id="ed-sub" maxlength="60" value="${esc(m.subtitle)}" placeholder="ör. Spor - 2003">
    <label>Kategori</label><select id="ed-cat">${cats.map(c => `<option ${c === m.category ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
  const modal = $('#modal');
  modal.classList.add('show');
  setTimeout(() => $('#ed-name').focus(), 50);
  $('#modal-cancel').onclick = () => modal.classList.remove('show');
  $('#modal-ok').onclick = async () => {
    await G.updateMod(m.id, { name: $('#ed-name').value, subtitle: $('#ed-sub').value, category: $('#ed-cat').value });
    modal.classList.remove('show');
    loadMods();
  };
}

async function importMods(mode) {
  const r = await G.importMods(mode);
  afterImport(r);
}
function afterImport(r) {
  if (!r) return;
  if (r.added.length) toast(r.added.length === 1 ? `${r.added[0].name} eklendi ✓ ${r.added[0].subtitle}` : `${r.added.length} mod eklendi ✓`);
  r.failed.forEach((f, i) => setTimeout(() => toast(`${f.file}: ${f.error}`, true), 3300 * (i + (r.added.length ? 1 : 0))));
  if (r.added.length) { loadMods(); refreshStore(); }
}

// sürükle-bırak
let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('#drop').classList.add('show'); });
window.addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('show'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', async e => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop').classList.remove('show');
  const paths = [...(e.dataTransfer.files || [])].map(f => G.pathOf(f)).filter(Boolean);
  if (!paths.length) return;
  if (S.page !== 'mods' && S.page !== 'cars') go('mods');
  afterImport(await G.importPaths(paths));
});

// ---------------- haberler / günlük ----------------
function newsImg(e) {
  if (e.modId) {
    const m = S.mods.find(x => x.id === e.modId);
    if (m) return modImg(m);
  }
  const seed = { launcher: 0, backup: 2, play: 1, mod: 3 }[e.kind] || 0;
  return Art.thumb(seed + (hash(e.title) % 2), '#d1d5db', e.kind === 'play' || e.kind === 'mod');
}
function newsHtml(e) {
  return `<div class="news-item"><div class="news-img">${newsImg(e)}</div><div><b>${esc(e.title)}</b><p>${esc(e.text)}</p><time>${date(e.t)}</time></div></div>`;
}
function renderNews() {
  const j = (S.store && S.store.journal) || [];
  $('#news-list').innerHTML = j.slice(0, 3).map(newsHtml).join('') || '<p class="empty">Henüz bir şey olmadı.</p>';
}
function renderJournal() {
  const j = (S.store && S.store.journal) || [];
  $('#journal-full').innerHTML = j.slice(0, 30).map(newsHtml).join('') || '<p class="empty">Henüz bir şey olmadı.</p>';
}
G.onJournal(e => { if (S.store) { S.store.journal.unshift(e); renderNews(); if (S.page === 'about') renderJournal(); } });

// ---------------- oyna sayfası ----------------
function renderPlay() {
  const st = S.store ? S.store.stats : { playSeconds: 0, sessions: 0 };
  $('#st-time').textContent = duration(st.playSeconds || 0);
  $('#st-sessions').textContent = st.sessions || 0;
  $('#st-last').textContent = ago(st.lastPlayed);
  const g = S.game;
  const rows = [];
  const row = (state, title, text, btn) => rows.push(`<div class="check-row"><span class="check-ic ${state}">${state === 'ok' ? '✓' : '!'}</span><div><b>${title}</b><small>${text}</small></div>${btn || ''}</div>`);
  if (g && g.ok) row('ok', 'Oyun bulundu', esc(g.dir));
  else row('bad', 'Oyun klasörü seçilmedi', 'gta_sa.exe\'nin olduğu klasörü seç.', '<button class="btn orange" data-go="settings">Seç</button>');
  if (g && g.ok) {
    row(g.moddable ? 'ok' : 'warn', `Sürüm: ${esc(g.version)}`, g.moddable ? 'Modlarla uyumlu.' : 'Bu sürümde çoğu mod çalışmaz; 1.0 sürümü önerilir.');
    if (!g.modloader) row('warn', 'Mod desteği kurulu değil', 'Modlar kurulamaz. İstersen şimdi kur.', '<button class="btn orange" data-action="install-support">Kur</button>');
    else row(g.modsEnabled ? 'ok' : 'warn', g.modsEnabled ? 'Modlar açık' : 'Modlar kapalı', g.modsEnabled ? `${S.mods.filter(m => m.installed).length + S.external.length} mod oyunla birlikte yüklenecek.` : 'Oyun orijinal hâliyle açılacak.',
      `<button class="btn ghost" data-action="toggle-mods" data-on="${g.modsEnabled ? 0 : 1}">${g.modsEnabled ? 'Kapat' : 'Aç'}</button>`);
  }
  const auto = S.store && S.store.settings.autoBackup;
  row(auto ? 'ok' : 'warn', auto ? 'Otomatik yedek açık' : 'Otomatik yedek kapalı', auto ? 'Her oyundan önce kayıtların yedeklenir.' : 'Kayıtlarını korumak için Ayarlar\'dan açabilirsin.');
  $('#checklist').innerHTML = rows.join('');
  const t = $('#play-status-title'), p = $('#play-status-text');
  if (S.running) { t.textContent = 'Oyun açık'; p.textContent = 'İyi eğlenceler! Oyunu kapatınca süren kaydedilecek.'; }
  else if (g && g.ok) { t.textContent = 'Hazır'; p.textContent = 'Her şey yolunda. Oyna\'ya bas, gerisini launcher halleder.'; }
  else { t.textContent = 'Kurulum gerekli'; p.textContent = 'Önce oyun klasörünü seçmelisin.'; }
}

// ---------------- ayarlar ----------------
function renderSettings() {
  const g = S.game, st = S.store.settings;
  $('#set-dir').textContent = g && g.ok ? g.dir : (st.gameDir ? `${st.gameDir} (oyun bulunamadı)` : 'Seçilmedi');
  $('#set-version').textContent = g && g.ok ? `${g.exeName} · ${bytes(g.size)}` : '—';
  const chip = $('#set-version-chip');
  chip.textContent = g && g.ok ? g.version : '—';
  chip.className = 'chip ' + (g && g.ok ? (g.moddable ? 'ok' : 'warn') : '');
  const sd = $('#support-detail');
  if (!g || !g.ok) sd.innerHTML = '<p class="empty">Önce oyun klasörünü seç.</p>';
  else sd.innerHTML = `
    <div class="row-set"><div><b>ASI Loader</b><small>.asi eklentilerini yükler (Ultimate ASI Loader)</small></div><span class="chip ${g.asiLoader ? 'ok' : 'warn'}">${g.asiLoader ? 'Kurulu' : 'Yok'}</span></div>
    <div class="row-set"><div><b>Mod Loader</b><small>Modları orijinal dosyalara dokunmadan yükler</small></div><span class="chip ${g.modloader ? 'ok' : 'warn'}">${g.modloader ? 'Kurulu' : 'Yok'}</span></div>
    ${g.asiLoader && g.modloader
      ? `<div class="row-set"><div><b>Modlarla oyna</b><small>Kapatırsan oyun orijinal hâliyle açılır; modların silinmez</small></div><label class="switch"><input type="checkbox" id="mods-on" ${g.modsEnabled ? 'checked' : ''}><span></span></label></div>`
      : `<div class="row-set"><div><b>Tek tıkla kur</b><small>İkisi de GitHub'daki resmî sayfalarından indirilip oyun klasörüne kopyalanır.</small></div><button class="btn orange" data-action="install-support">Kur</button></div>`}`;
  const t = $('#mods-on');
  if (t) t.onchange = () => toggleMods(t.checked);
  $$('#after-play button').forEach(b => b.classList.toggle('active', b.dataset.v === st.afterPlay));
  $('#auto-backup').checked = !!st.autoBackup;
  $('#keep-backups').value = st.keepBackups;
  $('#keep-backups-v').textContent = st.keepBackups;
}
$('#after-play').addEventListener('click', async e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  S.store.settings = await G.setSettings({ afterPlay: b.dataset.v });
  renderSettings();
});
$('#auto-backup').addEventListener('change', async e => { S.store.settings = await G.setSettings({ autoBackup: e.target.checked }); });
$('#keep-backups').addEventListener('input', async e => {
  $('#keep-backups-v').textContent = e.target.value;
  S.store.settings = await G.setSettings({ keepBackups: +e.target.value });
});

// ---------------- yedekleme ----------------
async function doBackup() {
  const r = await G.backup();
  toast(r.ok ? `${r.backup.count} kayıt yedeklendi ✓` : r.message, !r.ok);
  if (S.page === 'backup') loadBackups();
}
async function loadBackups() {
  const [saves, backups] = await Promise.all([G.saves(), G.backups()]);
  $('#save-list').innerHTML = saves.saves.length ? saves.saves.map(s => `
    <div class="list-row"><span class="slot">${s.slot}</span><div class="info"><b>${esc(s.title || `Kayıt ${s.slot}`)}</b><small>${dateTime(s.mtime)} · ${bytes(s.size)}</small></div></div>`).join('')
    : `<p class="empty">${saves.exists ? 'Henüz kayıt dosyası yok.' : 'Kayıt klasörü bulunamadı. Oyunu bir kez açıp kaydedince burada görünür.'}</p>`;
  $('#backup-list').innerHTML = backups.length ? backups.map(b => `
    <div class="list-row"><span class="slot">⟲</span><div class="info"><b>${esc(b.label)}</b><small>${dateTime(b.created)} · ${b.count} kayıt</small></div>
    <button class="btn ghost" data-action="restore" data-id="${esc(b.id)}">Geri yükle</button><button class="btn ghost" data-action="delete-backup" data-id="${esc(b.id)}">Sil</button></div>`).join('')
    : '<p class="empty">Henüz yedek yok. "Şimdi yedekle" ile ilkini al.</p>';
}

// ---------------- başlangıç ----------------
async function refreshStore() {
  S.store = await G.store();
  renderNews();
  if (S.page === 'play') renderPlay();
}
async function refreshAll() {
  S.game = await G.gameState();
  S.running = !!S.game.running;
  await refreshStore();
  await loadMods();
  renderGameState();
  if (S.page === 'settings') renderSettings();
  if (S.page === 'play') renderPlay();
  if (S.page === 'mods' || S.page === 'cars') renderMods();
}
window.__refresh = refreshAll;

async function init() {
  $('#brand-logo').innerHTML = Art.logo(52);
  $('#about-logo').innerHTML = Art.logo(84);
  $('#hero-art').innerHTML = Art.hero(7);
  $('#hero-art-2').innerHTML = Art.hero(19);
  $('#side-art').insertAdjacentHTML('afterbegin', Art.side());
  $('#sb-thumb').innerHTML = Art.thumb(0, '#1d3b2f', true);
  $('#sb-palm').innerHTML = `<svg viewBox="0 0 40 52"><path d="M22 52 Q21 30 24 14" stroke="#ff7a1a" stroke-width="3" fill="none"/><path d="M24 14 Q12 6 2 14 Q14 10 24 16 Q16 18 8 30 Q20 20 25 17 Q30 22 32 34 Q32 20 26 15 Q36 10 40 18 Q36 6 24 14Z" fill="#ff7a1a"/></svg>`;
  const info = await G.info();
  $('#version').textContent = `Launcher v${info.version}`;
  await refreshAll();
  const hour = new Date().getHours();
  $('#hero-hello').textContent = hour < 6 ? 'Gece yarısı turuna hazır mısın?' : hour < 12 ? 'Günaydın! Los Santos seni bekliyor.' : hour < 18 ? 'Los Santos\'a tekrar hoş geldin!' : 'İyi akşamlar! Şehir ışıkları yandı.';
  setInterval(async () => { if (!S.running) { const g = await G.gameState(); if (JSON.stringify(g) !== JSON.stringify(S.game)) { S.game = g; renderGameState(); } } }, 15000);
}
init();
