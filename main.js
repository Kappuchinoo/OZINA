const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserTabManager } = require('./browser-tabs');
const { PrivacyManager, PERMISSION_NAMES } = require('./privacy-manager');

const managers = new WeakMap();

function trustedManager(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.webContents !== event.sender) throw new Error('Untrusted browser UI sender.');
  const manager = managers.get(window);
  if (!manager) throw new Error('Browser window is no longer available.');
  return manager;
}

function tabContents(manager, id) {
  const tab = manager.getTab(id);
  if (typeof id !== 'string' || !tab || tab.view.webContents.isDestroyed()) throw new TypeError('Invalid browser tab.');
  return tab.view.webContents;
}

function registerBrowserIPC() {
  ipcMain.handle('browser:get-state', event => trustedManager(event).ensureInitialTab());
  ipcMain.handle('browser:create-tab', event => trustedManager(event).createTab());
  ipcMain.handle('browser:open-private-tab', event => trustedManager(event).openPrivateTab());
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
    manager.setLayout(layout.toolbarHeight, layout.rightInset);
  });
  ipcMain.handle('browser:set-page-visible', (event, visible) => trustedManager(event).setPageVisible(Boolean(visible)));
  ipcMain.handle('browser:find', (event, text, options = {}) => {
    const manager = trustedManager(event);
    if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
    if (typeof text !== 'string' || text.length > 500) throw new TypeError('Invalid find query.');
    return text ? manager.find(text, { forward: options.forward !== false, findNext: Boolean(options.findNext), matchCase: Boolean(options.matchCase) }) : 0;
  });
  ipcMain.handle('browser:stop-find', (event, action) => {
    if (!['clearSelection', 'keepSelection', 'activateSelection'].includes(action)) action = 'clearSelection';
    return trustedManager(event).stopFind(action);
  });
  ipcMain.handle('browser:set-muted', (event, id, muted) => trustedManager(event).setMuted(id, Boolean(muted)));
  ipcMain.handle('browser:set-zoom', (event, id, factor) => trustedManager(event).setZoom(id, factor));

  ipcMain.handle('privacy:get-site-state', async (event, id) => {
    const manager = trustedManager(event);
    return manager.privacy.getSiteState(tabContents(manager, id));
  });
  ipcMain.handle('privacy:set-permission', (event, id, permission, value) => {
    const manager = trustedManager(event);
    if (!PERMISSION_NAMES.includes(permission)) throw new TypeError('Unsupported site permission.');
    return manager.privacy.setSitePermission(tabContents(manager, id), permission, value);
  });
  ipcMain.handle('privacy:reset-site', (event, id) => {
    const manager = trustedManager(event);
    return manager.privacy.resetSite(tabContents(manager, id));
  });
  ipcMain.handle('privacy:clear-site-data', async (event, id) => {
    const manager = trustedManager(event);
    return manager.privacy.clearSiteData(tabContents(manager, id));
  });
  ipcMain.handle('privacy:clear-all-data', async (event, isPrivate = false) => trustedManager(event).privacy.clearAllData(Boolean(isPrivate)));
  ipcMain.handle('privacy:get-settings', event => ({ ...trustedManager(event).privacy.settings }));
  ipcMain.handle('privacy:update-settings', (event, values) => trustedManager(event).privacy.updateSettings(values));
  ipcMain.handle('privacy:resolve-prompt', (event, id, choice) => {
    if (typeof id !== 'string' || id.length > 80 || !['allow-once', 'allow-site', 'block'].includes(choice)) throw new TypeError('Invalid permission response.');
    return trustedManager(event).privacy.resolvePrompt(id, choice);
  });
  ipcMain.handle('privacy:resolve-screen', (event, id, sourceId) => {
    if (typeof id !== 'string' || id.length > 80 || typeof sourceId !== 'string' || sourceId.length > 2048) throw new TypeError('Invalid screen selection.');
    return trustedManager(event).privacy.resolveScreen(id, sourceId);
  });
  ipcMain.handle('privacy:resolve-device', (event, id, action, deviceId) => {
    if (typeof id !== 'string' || id.length > 80 || !['allow-once', 'allow-site', 'block'].includes(action) || typeof deviceId !== 'string' || deviceId.length > 2048) throw new TypeError('Invalid device selection.');
    return trustedManager(event).privacy.resolveDevicePrompt(id, action, deviceId);
  });
  ipcMain.handle('privacy:resolve-popup', (event, id, choice) => {
    if (typeof id !== 'string' || !['allow-once', 'allow-site', 'block'].includes(choice)) throw new TypeError('Invalid popup response.');
    return trustedManager(event).privacy.resolvePopup(id, choice);
  });
  ipcMain.handle('privacy:resolve-download', (event, id, choice) => {
    if (typeof id !== 'string' || !['allow-once', 'allow-site', 'block'].includes(choice)) throw new TypeError('Invalid download response.');
    return trustedManager(event).privacy.resolveDownload(id, choice);
  });
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
  let manager;
  const privacy = new PrivacyManager(win, contents => manager?.ownsContents(contents), {
    onPrompt: prompt => { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('privacy:prompt', prompt); },
    onNotice: notice => { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('privacy:notice', notice); },
    onChanged: origin => { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('privacy:updated', origin); },
    onOpenPopup: (url, contents) => {
      const source = [...(manager?.tabs.values() || [])].find(tab => tab.view.webContents === contents);
      if (source) manager.createTab(url, { isPrivate: source.isPrivate });
    }
  });
  manager = new BrowserTabManager(win, state => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('browser:state', state);
  }, privacy);
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
  win.on('closed', () => { privacy.close(); manager.destroy(); managers.delete(win); });
  win.loadURL(uiURL);
}

app.whenReady().then(() => {
  registerBrowserIPC();
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
