const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserTabManager } = require('./browser-tabs');

const managers = new WeakMap();

function trustedManager(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.webContents !== event.sender) throw new Error('Untrusted browser UI sender.');
  const manager = managers.get(window);
  if (!manager) throw new Error('Browser window is no longer available.');
  return manager;
}

function registerBrowserIPC() {
  ipcMain.handle('browser:get-state', event => trustedManager(event).ensureInitialTab());
  ipcMain.handle('browser:create-tab', event => trustedManager(event).createTab());
  ipcMain.handle('browser:activate-tab', (event, id) => {
    const manager = trustedManager(event);
    if (typeof id !== 'string' || id.length > 80) throw new TypeError('Invalid tab id.');
    return manager.activateTab(id);
  });
  ipcMain.handle('browser:close-tab', (event, id) => {
    const manager = trustedManager(event);
    if (typeof id !== 'string' || id.length > 80) throw new TypeError('Invalid tab id.');
    return manager.closeTab(id);
  });
  ipcMain.handle('browser:show-home', event => trustedManager(event).showHome());
  ipcMain.handle('browser:navigate', (event, input, engine) => {
    const manager = trustedManager(event);
    if (typeof input !== 'string' || input.length > 4096) return { ok: false, error: 'Address is too long.' };
    if (typeof engine !== 'string' || engine.length > 40) engine = 'DuckDuckGo';
    return manager.navigate(input, engine);
  });
  for (const command of ['back', 'forward', 'reload', 'stop']) {
    ipcMain.handle('browser:' + command, event => trustedManager(event)[command]());
  }
  ipcMain.handle('browser:set-layout', (event, layout) => {
    const manager = trustedManager(event);
    if (!layout || typeof layout !== 'object') return;
    manager.setLayout(layout.toolbarHeight);
  });
  ipcMain.handle('browser:set-page-visible', (event, visible) => trustedManager(event).setPageVisible(Boolean(visible)));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#101010',
    title: 'OZINA',
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const manager = new BrowserTabManager(win, state => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('browser:state', state);
  });
  managers.set(win, manager);
  const uiURL = pathToFileURL(path.join(__dirname, 'src', 'index.html')).href;
  win.webContents.on('will-navigate', (event, url) => { if (url !== uiURL) event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const sendWindowDisplayMode = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    const mode = win.isFullScreen() || win.isMaximized() ? 'immersive' : 'windowed';
    win.webContents.send('window:display-mode', mode);
  };
  win.on('resize', () => manager.updateBounds());
  win.on('enter-full-screen', () => { sendWindowDisplayMode(); manager.updateBounds(); });
  win.on('leave-full-screen', () => { sendWindowDisplayMode(); manager.updateBounds(); });
  win.on('maximize', () => { sendWindowDisplayMode(); manager.updateBounds(); });
  win.on('unmaximize', () => { sendWindowDisplayMode(); manager.updateBounds(); });
  win.webContents.on('did-finish-load', () => {
    sendWindowDisplayMode();
    manager.ensureInitialTab();
  });
  win.on('closed', () => { manager.destroy(); managers.delete(win); });
  win.loadURL(uiURL);
}

app.whenReady().then(() => {
  registerBrowserIPC();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const trustedWindow = event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.webContents === event.sender ? window : null;
  };
  ipcMain.on('window:minimize', event => trustedWindow(event)?.minimize());
  ipcMain.on('window:toggle-maximize', event => {
    const win = trustedWindow(event);
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize();
  });
  ipcMain.on('window:toggle-full-screen', event => {
    const win = trustedWindow(event);
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.on('window:close', event => trustedWindow(event)?.close());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
