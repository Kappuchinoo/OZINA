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
  onPrivacyPrompt: on('privacy:prompt'),
  onPrivacyUpdated: on('privacy:updated'),
  onPrivacyNotice: on('privacy:notice'),
  onPrivacyOutsideClick: on('privacy:outside-click'),
  onFindResult: on('browser:find-result'),
  browser: Object.freeze({
    getState: invoke('browser:get-state'),
    createTab: invoke('browser:create-tab'),
    openPrivateTab: invoke('browser:open-private-tab'),
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
    find: invoke('browser:find'),
    stopFind: invoke('browser:stop-find'),
    setMuted: invoke('browser:set-muted'),
    setZoom: invoke('browser:set-zoom'),
    onState: on('browser:state')
  }),
  privacy: Object.freeze({
    getSiteState: invoke('privacy:get-site-state'),
    setPermission: invoke('privacy:set-permission'),
    resetSite: invoke('privacy:reset-site'),
    clearSiteData: invoke('privacy:clear-site-data'),
    clearAllData: invoke('privacy:clear-all-data'),
    getSettings: invoke('privacy:get-settings'),
    updateSettings: invoke('privacy:update-settings'),
    resolvePrompt: invoke('privacy:resolve-prompt'),
    resolveScreen: invoke('privacy:resolve-screen'),
    resolveDevice: invoke('privacy:resolve-device'),
    resolvePopup: invoke('privacy:resolve-popup'),
    resolveDownload: invoke('privacy:resolve-download')
  })
});
