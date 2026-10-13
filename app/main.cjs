// Steam Redesigned (Project Vanguard) — desktop app (Electron main process).
// Starts the local data server in-process on 127.0.0.1, opens a frameless window with native
// Windows caption buttons, lives in the system tray, and keeps the renderer locked down:
// context isolation + sandbox, no Node in the page, every permission denied, navigation pinned
// to the local origin, external links handed to the default browser, and the Anthropic API key
// encrypted with the Windows account (safeStorage).

const { app, BrowserWindow, Tray, Menu, shell, ipcMain, safeStorage, session, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
app.setName('Steam Redesigned');
// The development copy keeps its original profile folder (so saved settings, cart and wishlist survive the rename);
// installed copies use their own, so both can run side by side on the same PC.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Steam Redesign'));
// Installed copies keep their data in the user's own profile folder; the development folder keeps it next to the code.
const DATA_DIR = app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(ROOT, 'data');

// Installed builds refuse debugging / inspection switches, so nothing can attach to a running copy.
if (app.isPackaged && process.argv.some((a) => /^--(remote-debugging|inspect|js-flags|remote-allow-origins)/i.test(a))) {
  process.exit(1);
}
const PORT = app.isPackaged ? 41790 : 41789;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ICON = path.join(ROOT, 'assets', 'icon.png');
const SETTINGS_FILE = path.join(DATA_DIR, 'app-settings.json');
const SECRET_FILE = path.join(DATA_DIR, 'secrets.bin');
const DEV = !app.isPackaged && process.argv.includes('--dev');
const START_HIDDEN = process.argv.includes('--hidden');

const DEFAULTS = { closeToTray: true, startWithWindows: false, startMinimized: false, hardwareAcceleration: true, autoUpdate: false, bounds: null, maximized: false, trayHintShown: false };
const BOOL_KEYS = new Set(['closeToTray', 'startWithWindows', 'startMinimized', 'hardwareAcceleration', 'autoUpdate']);

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
let settings = loadSettings();
const saveSettings = () => { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch { /* read-only folder */ } };

if (!settings.hardwareAcceleration) app.disableHardwareAcceleration();
app.setAppUserModelId('com.projectvanguard.steamredesigned');

let win = null;
let tray = null;
let server = null;
let quitting = false;

const secretStore = {
  get() {
    try {
      if (!fs.existsSync(SECRET_FILE) || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(fs.readFileSync(SECRET_FILE));
    } catch { return null; }
  },
  set(value) {
    if (!value) { try { fs.unlinkSync(SECRET_FILE); } catch { /* already gone */ } return; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is not available, so the key cannot be stored safely.');
    fs.writeFileSync(SECRET_FILE, safeStorage.encryptString(value));
  },
};

const isAppUrl = (url) => typeof url === 'string' && (url === ORIGIN || url.startsWith(`${ORIGIN}/`));
const openExternal = (url) => { if (/^https:\/\/[^\s]+$/.test(url)) shell.openExternal(url); };

function show(command) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (command) win.webContents.send('command', command);
}

function createWindow() {
  const b = settings.bounds || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...b,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: 'Steam Redesigned',
    icon: ICON,
    backgroundColor: '#0b1424',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#060b15', symbolColor: '#a7bbd0', height: 36 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: DEV,
      additionalArguments: [`--app-version=${app.getVersion()}`],
    },
  });
  if (settings.maximized) win.maximize();
  Menu.setApplicationMenu(null);

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); openExternal(url); } });
  wc.on('will-redirect', (e, url) => { if (!isAppUrl(url)) e.preventDefault(); });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { wc.reload(); e.preventDefault(); }
    if (DEV && input.control && input.shift && input.key.toLowerCase() === 'i') wc.toggleDevTools();
  });
  wc.on('console-message', (event) => { if (DEV || event.level === 'error') console.log(`[page:${event.level}] ${event.message}`); });
  wc.on('did-finish-load', () => console.log('window: page loaded'));
  wc.on('render-process-gone', (_e, d) => console.log(`window: renderer gone (${d.reason})`));

  win.loadURL(`${ORIGIN}/`);
  win.once('ready-to-show', () => {
    const hidden = START_HIDDEN && settings.startMinimized;
    if (!hidden) win.show();
  });

  let t;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { if (!win || win.isDestroyed()) return; settings.maximized = win.isMaximized(); if (!settings.maximized && !win.isMinimized()) settings.bounds = win.getBounds(); saveSettings(); }, 400); };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', (e) => {
    if (!quitting && settings.closeToTray && tray) {
      e.preventDefault();
      win.hide();
      if (!settings.trayHintShown) {
        tray.displayBalloon?.({ title: 'Steam Redesigned is still running', content: 'It keeps the catalog up to date. Quit from this tray icon.', iconType: 'info' });
        settings.trayHintShown = true;
        saveSettings();
      }
    }
  });
  win.on('closed', () => { win = null; });
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Steam Redesigned (Project Vanguard)');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Steam Redesigned', click: () => show() },
    { label: 'Update now', click: () => show('update') },
    { type: 'separator' },
    { label: 'Store', click: () => show('#/') },
    { label: 'Community', click: () => show('#/community') },
    { label: 'Discovery queue', click: () => show('#/queue') },
    { label: 'AI search', click: () => show('#/ai') },
    { label: 'Settings', click: () => show('settings') },
    { type: 'separator' },
    { label: 'Update the catalog now', click: () => server?.refresh() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => show());
}

function applyLoginItem() {
  app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, args: ['--hidden'] });
}

/* ------------------------------------------------------------------ IPC */

const fromApp = (event) => isAppUrl(event.senderFrame?.url || '');

ipcMain.handle('app:get-settings', (event) => {
  if (!fromApp(event)) return null;
  return { closeToTray: settings.closeToTray, startWithWindows: settings.startWithWindows, startMinimized: settings.startMinimized, hardwareAcceleration: settings.hardwareAcceleration, autoUpdate: settings.autoUpdate, dataDir: DATA_DIR };
});
ipcMain.handle('app:set-setting', (event, key, value) => {
  if (!fromApp(event) || !BOOL_KEYS.has(key) || typeof value !== 'boolean') return false;
  settings[key] = value;
  saveSettings();
  if (key === 'startWithWindows') applyLoginItem();
  return true;
});
ipcMain.handle('app:open-data', (event) => { if (fromApp(event)) shell.openPath(DATA_DIR); });
ipcMain.on('app:titlebar', (event, color, symbol) => {
  const hex = /^#[0-9a-f]{6}$/i;
  if (!fromApp(event) || !win || !hex.test(color) || !hex.test(symbol)) return;
  try { win.setTitleBarOverlay({ color, symbolColor: symbol }); } catch { /* not supported on this platform */ }
});

/* ---------------------------------------------------------------- start */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => show());
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (!settings.closeToTray) app.quit(); });
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e, url) => { if (!isAppUrl(url)) e.preventDefault(); });
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // First run of an installed copy: start from the bundled catalog so the store opens instantly
    try {
      const seed = path.join(process.resourcesPath || '', 'seed', 'catalog.json');
      fs.mkdirSync(DATA_DIR, { recursive: true });
      if (app.isPackaged && fs.existsSync(seed) && !fs.existsSync(path.join(DATA_DIR, 'catalog.json'))) fs.copyFileSync(seed, path.join(DATA_DIR, 'catalog.json'));
    } catch { /* the server builds a fresh catalog instead */ }
    try {
      const { startServer } = await import(pathToFileURL(path.join(ROOT, 'server.mjs')).href);
      server = await startServer({ port: PORT, dataDir: DATA_DIR, secretStore });
    } catch (e) {
      dialog.showErrorBox('Steam Redesigned could not start', `The local data server failed to start: ${e.message}\n\nAnother copy may already be using port ${PORT}.`);
      app.quit();
      return;
    }
    createTray();
    createWindow();
    applyLoginItem();
    if (settings.autoUpdate) setTimeout(() => server?.refresh(), 4000);
  });

  app.on('will-quit', async (e) => {
    if (!server) return;
    e.preventDefault();
    const s = server;
    server = null;
    await Promise.race([s.close(), new Promise((r) => setTimeout(r, 1500))]);
    app.quit();
  });
}
