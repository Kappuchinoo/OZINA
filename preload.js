const { contextBridge, ipcRenderer } = require('electron');

const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
const on = channel => callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('ozinaDesktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  toggleFullScreen: () => ipcRenderer.send('window:toggle-full-screen'),
  close: () => ipcRenderer.send('window:close'),
  onWindowDisplayMode: on('window:display-mode'),
  onShortcut: on('browser:shortcut'),
  browser: Object.freeze({
    getState: invoke('browser:get-state'),
    createTab: invoke('browser:create-tab'),
    activateTab: invoke('browser:activate-tab'),
    closeTab: invoke('browser:close-tab'),
    showHome: invoke('browser:show-home'),
    navigate: invoke('browser:navigate'),
    back: invoke('browser:back'),
    forward: invoke('browser:forward'),
    reload: invoke('browser:reload'),
    stop: invoke('browser:stop'),
    setLayout: invoke('browser:set-layout'),
    setPageVisible: invoke('browser:set-page-visible'),
    onState: on('browser:state')
  })
});
