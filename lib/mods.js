'use strict';
// Mod kütüphanesi: içe aktarma, analiz, modloader'a kurma/kaldırma.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const archive = require('./archive');
const vehicles = require('./vehicles');

const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);
const SCRIPT = new Set(['.asi', '.cs', '.cleo', '.lua', '.fxt', '.ini']);

class ModLibrary {
  constructor(root) {
    this.root = root;
    fs.mkdirSync(root, { recursive: true });
  }

  dir(id) { return path.join(this.root, path.basename(id)); }
  metaFile(id) { return path.join(this.dir(id), 'mod.json'); }

  async list() {
    let ids = [];
    try { ids = await fsp.readdir(this.root); } catch (e) { return []; }
    const out = [];
    for (const id of ids) {
      try { out.push(JSON.parse(await fsp.readFile(this.metaFile(id), 'utf8'))); } catch (e) {}
    }
    return out.sort((a, b) => b.added - a.added);
  }

  async get(id) { return JSON.parse(await fsp.readFile(this.metaFile(id), 'utf8')); }
  async save(meta) { await fsp.writeFile(this.metaFile(meta.id), JSON.stringify(meta, null, 2)); return meta; }

  // -------- içe aktarma --------
  async import(source, onStep) {
    const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const base = this.dir(id);
    const files = path.join(base, 'files');
    const isFolder = fs.statSync(source).isDirectory();
    try {
      onStep && onStep('Dosyalar açılıyor…');
      if (isFolder) await archive.copyDir(source, files);
      else await archive.extract(source, files);

      // iç içe arşiv (zip içinde rar gibi) varsa onları da aç
      const inner = (await walk(files)).filter(f => ['.zip', '.rar', '.7z'].includes(path.extname(f.path).toLowerCase()));
      for (const f of inner.slice(0, 5)) {
        try { await archive.extract(f.path, path.join(path.dirname(f.path), path.basename(f.path, path.extname(f.path)))); await fsp.unlink(f.path); } catch (e) {}
      }

      onStep && onStep('Mod inceleniyor…');
      const all = await walk(files);
      if (!all.length) throw new Error('Arşivin içi boş.');
      const info = analyze(all);
      const rawName = path.basename(source, isFolder ? '' : path.extname(source));
      const name = prettyName(rawName);

      let thumb = null;
      if (info.image) {
        thumb = 'thumb' + path.extname(info.image).toLowerCase();
        await fsp.copyFile(info.image, path.join(base, thumb));
      }

      const meta = {
        id,
        name,
        category: info.category,
        subtitle: info.subtitle,
        replaces: info.replaces,
        added: Date.now(),
        size: all.reduce((a, f) => a + f.size, 0),
        fileCount: all.length,
        thumb,
        installed: false,
        folderName: safeFolder(name) + '_' + id.slice(-4),
        source: path.basename(source),
        hasModelFiles: info.models > 0,
        color: info.color
      };
      await this.save(meta);
      return meta;
    } catch (e) {
      await fsp.rm(base, { recursive: true, force: true }).catch(() => {});
      throw e;
    }
  }

  // -------- kurulum --------
  async install(id, gameDir) {
    const meta = await this.get(id);
    if (meta.installed) return { meta };
    const ml = path.join(gameDir, 'modloader');
    if (!fs.existsSync(ml)) throw new Error('Önce Oyun Ayarları\'ndan mod desteğini kur.');
    const target = path.join(ml, meta.folderName);
    const warnings = [];
    // aynı aracı değiştiren başka kurulu mod var mı
    if (meta.replaces && meta.replaces.length) {
      const others = (await this.list()).filter(m => m.installed && m.id !== id);
      for (const o of others) {
        const clash = (o.replaces || []).filter(r => meta.replaces.some(x => x.model === r.model));
        if (clash.length) warnings.push(`${o.name} de ${clash.map(c => c.name).join(', ')} aracını değiştiriyor. İkisinden biri kullanılacak; çakışmayı önlemek için birini kaldırabilirsin.`);
      }
    }
    await move(path.join(this.dir(id), 'files'), target);
    meta.installed = true;
    meta.installedAt = Date.now();
    meta.gameDir = gameDir;
    await this.save(meta);
    return { meta, warnings };
  }

  async uninstall(id, gameDir) {
    const meta = await this.get(id);
    if (!meta.installed) return { meta };
    const src = path.join(gameDir || meta.gameDir, 'modloader', meta.folderName);
    if (fs.existsSync(src)) await move(src, path.join(this.dir(id), 'files'));
    meta.installed = false;
    await this.save(meta);
    return { meta };
  }

  async remove(id, gameDir) {
    const meta = await this.get(id);
    if (meta.installed) await this.uninstall(id, gameDir);
    await fsp.rm(this.dir(id), { recursive: true, force: true });
    return true;
  }

  async update(id, patch) {
    const meta = await this.get(id);
    for (const k of ['name', 'subtitle', 'category']) if (typeof patch[k] === 'string' && patch[k].trim()) meta[k] = patch[k].trim().slice(0, 60);
    return this.save(meta);
  }

  async setThumb(id, imagePath) {
    const meta = await this.get(id);
    const ext = path.extname(imagePath).toLowerCase();
    if (!IMG.has(ext)) throw new Error('Desteklenmeyen görsel türü.');
    if (meta.thumb) await fsp.unlink(path.join(this.dir(id), meta.thumb)).catch(() => {});
    meta.thumb = 'thumb' + Date.now().toString(36) + ext;
    await fsp.copyFile(imagePath, path.join(this.dir(id), meta.thumb));
    return this.save(meta);
  }

  thumbPath(meta) { return meta.thumb ? path.join(this.dir(meta.id), meta.thumb) : null; }

  // Kurulum durumunu diskteki gerçek hâliyle eşitle; modloader'daki yabancı modları listele
  async sync(gameDir) {
    const list = await this.list();
    for (const m of list) {
      if (m.installed && gameDir) {
        const there = fs.existsSync(path.join(gameDir, 'modloader', m.folderName));
        const here = fs.existsSync(path.join(this.dir(m.id), 'files'));
        if (!there && here) { m.installed = false; await this.save(m); }
      }
    }
    const external = [];
    if (gameDir) {
      const ml = path.join(gameDir, 'modloader');
      let names = [];
      try { names = (await fsp.readdir(ml, { withFileTypes: true })).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name); } catch (e) {}
      const ours = new Set(list.map(m => m.folderName.toLowerCase()));
      for (const n of names) {
        if (ours.has(n.toLowerCase())) continue;
        const all = await walk(path.join(ml, n));
        const info = analyze(all);
        external.push({ id: 'ext:' + n, external: true, name: prettyName(n), folderName: n, category: info.category, subtitle: info.subtitle, replaces: info.replaces, installed: true, size: all.reduce((a, f) => a + f.size, 0), fileCount: all.length, color: info.color, added: 0 });
      }
    }
    return { mods: await this.list(), external };
  }

  // Elle kurulmuş bir modu kütüphaneye al (böylece açıp kapatılabilir)
  async adopt(folderName, gameDir) {
    const src = path.join(gameDir, 'modloader', path.basename(folderName));
    const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const all = await walk(src);
    const info = analyze(all);
    await fsp.mkdir(this.dir(id), { recursive: true });
    let thumb = null;
    if (info.image) { thumb = 'thumb' + path.extname(info.image).toLowerCase(); await fsp.copyFile(info.image, path.join(this.dir(id), thumb)); }
    const meta = { id, name: prettyName(folderName), category: info.category, subtitle: info.subtitle, replaces: info.replaces, added: Date.now(), size: all.reduce((a, f) => a + f.size, 0), fileCount: all.length, thumb, installed: true, installedAt: Date.now(), gameDir, folderName: path.basename(folderName), source: folderName, hasModelFiles: info.models > 0, color: info.color };
    await this.save(meta);
    return meta;
  }
}

// -------- yardımcılar --------
async function walk(dir, depth = 0, out = []) {
  if (depth > 12) return out;
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) await walk(p, depth + 1, out);
    else if (e.isFile()) {
      try { out.push({ path: p, size: (await fsp.stat(p)).size }); } catch (er) {}
    }
  }
  return out;
}

function analyze(files) {
  const replaces = [];
  let models = 0, scripts = 0, skins = 0;
  const images = [];
  const txd = new Set(files.filter(f => /\.txd$/i.test(f.path)).map(f => path.basename(f.path, '.txd').toLowerCase()));
  for (const f of files) {
    const ext = path.extname(f.path).toLowerCase();
    const base = path.basename(f.path, ext).toLowerCase();
    if (ext === '.dff') {
      models++;
      const v = vehicles.lookup(base);
      if (v) { if (!replaces.some(r => r.model === v.model)) replaces.push({ model: v.model, name: v.name, id: v.id }); }
      else if (txd.has(base)) skins++;
    } else if (SCRIPT.has(ext) && ext !== '.ini') scripts++;
    else if (IMG.has(ext)) images.push(f);
  }
  let category = 'Diğer';
  if (replaces.length) category = vehicles.kind(replaces[0].model);
  else if (skins) category = 'Skin';
  else if (scripts) category = 'Script';
  else if (models || txd.size) category = 'Model';

  let subtitle = '';
  if (replaces.length === 1) subtitle = `${replaces[0].name} yerine`;
  else if (replaces.length > 1) subtitle = `${replaces.length} aracı değiştirir`;
  else if (category === 'Skin') subtitle = `${skins} karakter görünümü`;
  else if (category === 'Script') subtitle = `${scripts} betik`;
  else subtitle = `${files.length} dosya`;

  // önizleme görseli: adında önizleme geçen ya da en büyük görsel
  const score = f => (/(preview|screen|shot|onizleme|thumb|cover|pic|img|\b1\b)/i.test(path.basename(f.path)) ? 1e12 : 0) + f.size;
  images.sort((a, b) => score(b) - score(a));
  const image = images.find(f => f.size > 8 * 1024 && f.size < 12 * 1024 * 1024) || null;

  const palette = ['#e5e7eb', '#9ca3af', '#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#111827'];
  const color = palette[(replaces[0] ? replaces[0].id : files.length) % palette.length];
  return { replaces, category, subtitle, image: image && image.path, models, color };
}

function prettyName(raw) {
  let s = String(raw)
    .replace(/[_.]+/g, ' ')
    .replace(/\b(v|ver|version)\s?\d+(\s\d+)*\b/gi, '')
    .replace(/\b(gta|sa|san andreas|mod|by|for|final|rar|zip)\b/gi, m => /^(gta|sa)$/i.test(m) ? '' : m)
    .replace(/[\[\(\{]\s*[\]\)\}]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!s) s = String(raw);
  const word = w => {
    if (/\d/.test(w) && w.length <= 5) return w.toUpperCase();            // m3 → M3, e46 → E46
    if (/^[^aeıioöuüy]{2,4}$/i.test(w)) return w.toUpperCase();            // bmw → BMW
    if (w.length > 2 && w === w.toLowerCase()) return w[0].toUpperCase() + w.slice(1);
    return w;
  };
  return s.split(' ').map(word).join(' ').slice(0, 48);
}

function safeFolder(name) {
  return name.normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'mod';
}

async function move(src, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) await fsp.rm(dest, { recursive: true, force: true });
  try {
    await fsp.rename(src, dest);
  } catch (e) {
    // farklı sürücüler arasında taşıma: kopyala ve sil
    await fsp.cp(src, dest, { recursive: true, force: true });
    await fsp.rm(src, { recursive: true, force: true });
  }
}

module.exports = { ModLibrary, analyze, prettyName };
