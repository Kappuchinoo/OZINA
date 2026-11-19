const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ozinaDesktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  toggleFullScreen: () => ipcRenderer.send('window:toggle-full-screen'),
  close: () => ipcRenderer.send('window:close'),
  onWindowDisplayMode: (callback) => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on('window:display-mode', listener);
    return () => ipcRenderer.removeListener('window:display-mode', listener);
  }
});
