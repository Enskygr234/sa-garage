'use strict';
// Launcher ayarları, oyun süresi ve garaj günlüğü için JSON deposu.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    gameDir: '',
    afterPlay: 'minimize',   // 'minimize' | 'keep' | 'close'
    autoBackup: true,
    keepBackups: 20
  },
  stats: { playSeconds: 0, sessions: 0, lastPlayed: null },
  journal: []
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'sa-garage.json');
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        ...this.data, ...raw,
        settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
        stats: { ...DEFAULTS.stats, ...(raw.stats || {}) }
      };
    } catch (e) { /* ilk açılış */ }
    this.timer = null;
  }
  get settings() { return this.data.settings; }
  set(patch) { Object.assign(this.data.settings, patch); this.save(); return this.data.settings; }
  log(kind, title, text, extra = {}) {
    const e = { t: Date.now(), kind, title, text, ...extra };
    this.data.journal.unshift(e);
    this.data.journal = this.data.journal.slice(0, 100);
    this.save();
    return e;
  }
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 300); }
  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) {}
  }
}
module.exports = Store;
