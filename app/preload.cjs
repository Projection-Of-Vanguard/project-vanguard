// Exposes a small, fixed API to the page. Nothing from Node or Electron leaks through:
// each function maps to one validated IPC channel in app/main.cjs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isApp: true,
  version: (process.argv.find((a) => a.startsWith('--app-version=')) || '').slice(14) || '3.0.0',
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('app:get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('app:set-setting', String(key), Boolean(value)),
  openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  openSteam: (appid) => ipcRenderer.send('app:open-steam', Number(appid)),
  openSoundSettings: () => ipcRenderer.send('app:open-sound-settings'),
  setTitleBar: (color, symbol) => ipcRenderer.send('app:titlebar', String(color), String(symbol)),
  notify: (title, body, hash) => ipcRenderer.send('app:notify', String(title), String(body), hash == null ? null : String(hash)),
  onCommand: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('command', (_event, command) => { if (typeof command === 'string' && command.length < 100) callback(command); });
  },
});
