'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = ch => cb => {
  const fn = (e, d) => cb(d);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};
const inv = ch => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('garage', {
  info: inv('app:info'),
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  store: inv('store:get'),
  setSettings: inv('settings:set'),

  gameState: inv('game:state'),
  autodetect: inv('game:autodetect'),
  setGameDir: inv('game:setDir'),
  chooseGame: inv('game:choose'),
  play: inv('game:play'),
  open: inv('game:open'),
  resetSettings: inv('game:resetSettings'),

  installSupport: inv('modsupport:install'),
  toggleMods: inv('modsupport:toggle'),

  mods: inv('mods:list'),
  importMods: inv('mods:import'),
  importPaths: inv('mods:importPaths'),
  installMod: inv('mods:install'),
  uninstallMod: inv('mods:uninstall'),
  removeMod: inv('mods:remove'),
  updateMod: inv('mods:update'),
  setModThumb: inv('mods:thumb'),
  adoptMod: inv('mods:adopt'),
  openMod: inv('mods:openFolder'),

  saves: inv('saves:get'),
  backups: inv('backup:list'),
  backup: inv('backup:create'),
  restore: inv('backup:restore'),
  deleteBackup: inv('backup:delete'),

  pathOf: file => { try { return webUtils.getPathForFile(file); } catch (e) { return null; } },

  onProgress: on('progress'),
  onJournal: on('journal'),
  onRunning: on('game:running'),
  onWinState: on('win:state')
});
