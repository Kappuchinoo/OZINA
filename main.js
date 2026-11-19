const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

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
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  const sendWindowDisplayMode = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    const mode = win.isFullScreen() || win.isMaximized() ? 'immersive' : 'windowed';
    win.webContents.send('window:display-mode', mode);
  };
  win.on('enter-full-screen', sendWindowDisplayMode);
  win.on('leave-full-screen', sendWindowDisplayMode);
  win.on('maximize', sendWindowDisplayMode);
  win.on('unmaximize', sendWindowDisplayMode);
  win.webContents.on('did-finish-load', sendWindowDisplayMode);
}

app.whenReady().then(() => {
  ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize();
  });
  ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.on('window:toggle-full-screen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
