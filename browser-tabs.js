const { WebContentsView } = require('electron');
const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');

const SEARCH_ENGINES = {
  DuckDuckGo: 'https://duckduckgo.com/?q=',
  Google: 'https://www.google.com/search?q=',
  'Brave Search': 'https://search.brave.com/search?q='
};

function resolveAddress(input, engineName = 'DuckDuckGo') {
  const text = String(input || '').trim();
  if (!text || text.length > 4096) return { error: 'Enter a website address or search query.' };
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (!validHostname(url.hostname)) return { error: 'That web address is incomplete or invalid.' };
      return { url: url.href };
    } catch { return { error: 'That web address is not valid.' }; }
  }
  const hasWhitespace = /\s/.test(text);
  const addressLike = !hasWhitespace && (text === 'localhost' || text.startsWith('localhost:') || text.startsWith('127.') || /^[a-z0-9.-]+(?::\d+)?(?:[/?#].*)?$/i.test(text) && text.split(/[/:?#]/)[0].includes('.'));
  if (addressLike) {
    try {
      const url = new URL(`https://${text}`);
      if (validHostname(url.hostname) && (url.hostname.includes('.') || url.hostname === 'localhost' || isIP(url.hostname.replace(/^\[|\]$/g, '')))) return { url: url.href };
    } catch { return { error: 'That web address is not valid.' }; }
  }
  const searchBase = SEARCH_ENGINES[engineName] || SEARCH_ENGINES.DuckDuckGo;
  return { url: `${searchBase}${encodeURIComponent(text)}` };
}

function validHostname(hostname) {
  const value = String(hostname || '').replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!value) return false;
  if (value === 'localhost' || isIP(value)) return true;
  return value.length <= 253 && value.split('.').every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function isWebURL(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}

class BrowserTabManager {
  constructor(window, onState, privacy = null) {
    this.window = window;
    this.onState = onState;
    this.privacy = privacy;
    this.tabs = new Map();
    this.activeId = null;
    this.toolbarHeight = 0;
    this.rightInset = 0;
    this.hasLayout = false;
    this.pageVisible = true;
    this.destroying = false;
  }

  ensureInitialTab() {
    if (this.tabs.size === 0) this.createTab();
    return this.snapshot();
  }

  createTab(initialURL, options = {}) {
    const id = randomUUID();
    const webPreferences = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true };
    if (options.isPrivate) webPreferences.partition = 'temp:ozina-private';
    const view = new WebContentsView({ webPreferences });
    this.privacy?.attach(view.webContents.session, Boolean(options.isPrivate));
    const tab = { id, title: 'New tab', url: '', favicon: '', isHome: true, homeCanForward: false, isLoading: false, error: '', isPrivate: Boolean(options.isPrivate), muted: false, view };
    this.tabs.set(id, tab);
    this.window.contentView.addChildView(view);
    view.setVisible(false);
    this.attachEvents(tab);
    this.activateTab(id);
    if (initialURL) void this.navigate(initialURL, 'DuckDuckGo');
    this.emitState();
    return this.snapshot();
  }

  attachEvents(tab) {
    const contents = tab.view.webContents;
    this.privacy?.attachContents(contents);
    contents.on('before-input-event', (_event, input) => {
      if (input.type === 'mouseDown' && !this.window.isDestroyed() && !this.window.webContents.isDestroyed()) this.window.webContents.send('privacy:outside-click');
    });
    contents.on('before-input-event', (event, input) => this.handlePageShortcut(event, input, tab.id));
    contents.on('found-in-page', (_event, result) => {
      if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) this.window.webContents.send('browser:find-result', result);
    });
    contents.setWindowOpenHandler(({ url }) => {
      this.privacy?.handlePopup(contents, url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, details, legacyURL) => {
      const url = typeof details === 'string' ? details : details?.url || legacyURL || event.url;
      if (!isWebURL(url)) event.preventDefault();
    });
    contents.on('will-redirect', (event, details, legacyURL) => {
      const url = typeof details === 'string' ? details : details?.url || legacyURL || event.url;
      if (!isWebURL(url)) event.preventDefault();
    });
    contents.on('did-start-loading', () => { tab.isLoading = true; tab.error = ''; this.emitState(); });
    contents.on('did-stop-loading', () => { tab.isLoading = false; this.emitState(); });
    contents.on('did-navigate', (_event, url) => { tab.url = url; tab.isHome = false; tab.error = ''; this.privacy?.onNavigation(contents, url); this.emitState(); });
    contents.on('did-navigate-in-page', (_event, url) => { tab.url = url; this.emitState(); });
    contents.on('page-title-updated', (_event, title) => { tab.title = title || tab.url || 'New tab'; this.emitState(); });
    contents.on('page-favicon-updated', (_event, favicons) => { tab.favicon = favicons?.[0] || ''; this.emitState(); });
    contents.on('did-fail-load', (_event, errorCode, description, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      tab.isLoading = false;
      tab.error = description || `Navigation failed (${errorCode}).`;
      tab.url = validatedURL || tab.url;
      this.emitState();
    });
    contents.on('render-process-gone', (_event, details) => {
      tab.isLoading = false;
      tab.error = `Page process stopped: ${details.reason}.`;
      this.emitState();
    });
    contents.once('destroyed', () => {
      if (this.destroying || this.window.isDestroyed() || !this.tabs.has(tab.id)) return;
      this.window.contentView.removeChildView(tab.view);
      this.tabs.delete(tab.id);
      if (this.tabs.size === 0) this.createTab();
      else if (this.activeId === tab.id) this.activateTab(this.tabs.keys().next().value);
      this.emitState();
    });
  }

  handlePageShortcut(event, input, tabId) {
    if (input.type !== 'keyDown') return;
    const mac = process.platform === 'darwin';
    const modifier = mac ? input.meta : input.control;
    const key = String(input.key || '').toLowerCase();
    if ((modifier && key === 'l') || input.key === 'F6') {
      event.preventDefault();
      this.window.webContents.focus();
      this.window.webContents.send('browser:shortcut', 'focus-address');
    } else if (modifier && key === 't') {
      event.preventDefault(); this.createTab();
    } else if (modifier && input.shift && key === 'n') {
      event.preventDefault(); this.openPrivateTab();
    } else if (modifier && key === 'f' && !(mac && input.control)) {
      event.preventDefault();
      this.window.webContents.focus();
      this.window.webContents.send('browser:shortcut', 'find');
    } else if (modifier && key === 'w') {
      event.preventDefault(); this.closeTab(tabId);
    } else if (modifier && key === 'r' || input.key === 'F5') {
      event.preventDefault(); this.reload();
    } else if (input.alt && input.key === 'ArrowLeft' || mac && input.meta && input.key === '[') {
      event.preventDefault(); this.back();
    } else if (input.alt && input.key === 'ArrowRight' || mac && input.meta && input.key === ']') {
      event.preventDefault(); this.forward();
    } else if ((input.control || mac && input.meta) && input.key === 'Tab') {
      event.preventDefault();
      const ids = [...this.tabs.keys()];
      const index = ids.indexOf(this.activeId);
      const step = input.shift ? -1 : 1;
      if (ids.length > 1) this.activateTab(ids[(index + step + ids.length) % ids.length]);
    } else if (modifier && /^[1-8]$/.test(input.key)) {
      event.preventDefault();
      const id = [...this.tabs.keys()][Number(input.key) - 1];
      if (id) this.activateTab(id);
    } else if (input.key === 'F11' || mac && input.control && input.meta && key === 'f') {
      event.preventDefault(); this.window.setFullScreen(!this.window.isFullScreen());
    } else if (input.key === 'Escape') {
      if (this.privacy?.cancelForContents(this.tabs.get(tabId)?.view.webContents)) event.preventDefault();
      if (!this.window.webContents.isDestroyed()) this.window.webContents.send('browser:shortcut', 'escape');
      if (this.tabs.get(tabId)?.isLoading) { event.preventDefault(); this.stop(); }
    }
  }

  activateTab(id) {
    const tab = this.tabs.get(id);
    if (!tab || tab.view.webContents.isDestroyed()) return false;
    for (const item of this.tabs.values()) item.view.setVisible(false);
    this.activeId = id;
    if (this.pageVisible && this.hasLayout && !tab.isHome) {
      this.window.contentView.addChildView(tab.view);
      tab.view.setVisible(true);
      this.updateBounds();
    }
    this.emitState();
    return true;
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return this.snapshot();
    const wasPrivate = tab.isPrivate;
    this.window.contentView.removeChildView(tab.view);
    this.tabs.delete(id);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.destroy();
    if (wasPrivate && ![...this.tabs.values()].some(item => item.isPrivate)) void this.privacy?.clearAllData(true);
    if (this.tabs.size === 0) return this.createTab();
    if (this.activeId === id) this.activateTab(this.tabs.keys().next().value);
    this.emitState();
    return this.snapshot();
  }

  async navigate(input, engine) {
    const tab = this.tabs.get(this.activeId);
    if (!tab) return { ok: false, error: 'There is no active tab.' };
    const result = resolveAddress(input, engine);
    if (result.error) return { ok: false, invalid: true, error: result.error };
    tab.homeCanForward = tab.isHome;
    tab.isHome = false;
    tab.error = '';
    tab.url = result.url;
    tab.title = result.url;
    this.showActivePage();
    this.emitState();
    try { await tab.view.webContents.loadURL(result.url); return { ok: true, url: result.url }; }
    catch (error) {
      tab.isLoading = false;
      if (error.code === 'ERR_ABORTED') { this.emitState(); return { ok: true, cancelled: true }; }
      tab.error = error.message || 'Navigation failed.';
      this.emitState();
      return { ok: false, error: tab.error };
    }
  }

  showHome() {
    const tab = this.tabs.get(this.activeId);
    if (!tab) return;
    if (tab.isLoading) tab.view.webContents.stop();
    tab.isHome = true;
    tab.title = 'New tab';
    tab.favicon = '';
    tab.isLoading = false;
    tab.error = '';
    tab.homeCanForward = Boolean(tab.url);
    tab.view.setVisible(false);
    this.emitState();
  }

  showActivePage() {
    const tab = this.tabs.get(this.activeId);
    if (!tab || tab.view.webContents.isDestroyed()) return;
    tab.isHome = false;
    if (this.pageVisible && this.hasLayout) {
      this.window.contentView.addChildView(tab.view);
      tab.view.setVisible(true);
      this.updateBounds();
    }
  }

  back() {
    const tab = this.tabs.get(this.activeId);
    if (!tab) return;
    const contents = tab.view.webContents;
    const history = contents.navigationHistory;
    const previous = history.getEntryAtIndex(history.getActiveIndex() - 1);
    if (!tab.isHome && tab.homeCanForward && previous?.url === 'about:blank') this.showHome();
    else if (!tab.isHome && history.canGoBack()) history.goBack();
    else if (!tab.isHome) this.showHome();
    this.emitState();
  }

  forward() {
    const tab = this.tabs.get(this.activeId);
    if (!tab) return;
    const contents = tab.view.webContents;
    if (tab.isHome && tab.homeCanForward && tab.url) this.showActivePage();
    else if (!tab.isHome && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    this.emitState();
  }

  reload() { const tab = this.tabs.get(this.activeId); if (tab && !tab.isHome) tab.view.webContents.reload(); }
  stop() { const tab = this.tabs.get(this.activeId); if (tab && tab.isLoading) tab.view.webContents.stop(); }

  setPageVisible(visible) {
    this.pageVisible = Boolean(visible);
    const tab = this.tabs.get(this.activeId);
    for (const item of this.tabs.values()) item.view.setVisible(Boolean(this.hasLayout && this.pageVisible && item.id === this.activeId && !item.isHome));
    if (tab && this.pageVisible && !tab.isHome) this.updateBounds();
  }

  setLayout(toolbarHeight, rightInset = 0) {
    const height = Number(toolbarHeight);
    const inset = Number(rightInset);
    if (!Number.isFinite(height) || !Number.isFinite(inset)) return;
    this.hasLayout = true;
    this.toolbarHeight = Math.max(0, Math.min(Math.round(height), this.window.getContentSize()[1]));
    this.rightInset = Math.max(0, Math.min(Math.round(inset), Math.max(0, this.window.getContentSize()[0] - 320)));
    this.updateBounds();
    const active = this.tabs.get(this.activeId);
    if (active && this.pageVisible && !active.isHome && !active.view.webContents.isDestroyed()) active.view.setVisible(true);
  }

  updateBounds() {
    const [width, height] = this.window.getContentSize();
    const y = Math.max(0, Math.min(this.toolbarHeight, height));
    const contentWidth = Math.max(0, width - this.rightInset);
    for (const tab of this.tabs.values()) tab.view.setBounds({ x: 0, y, width: contentWidth, height: Math.max(0, height - y) });
  }

  find(text, options = {}) { const tab = this.tabs.get(this.activeId); if (!tab || !text) return 0; return tab.view.webContents.findInPage(text, options); }
  stopFind(action = 'clearSelection') { const tab = this.tabs.get(this.activeId); tab?.view.webContents.stopFindInPage(action); }
  setMuted(id, muted) { const tab = this.tabs.get(id); if (!tab) return false; tab.muted = Boolean(muted); tab.view.webContents.setAudioMuted(tab.muted); this.emitState(); return tab.muted; }
  setZoom(id, factor) {
    const tab = this.tabs.get(id);
    const zoom = Number(factor);
    if (!tab || !Number.isFinite(zoom) || zoom < 0.5 || zoom > 3) return false;
    tab.view.webContents.setZoomFactor(zoom);
    this.privacy?.setSiteZoom(tab.view.webContents, zoom);
    this.emitState();
    return zoom;
  }
  ownsContents(contents) { return [...this.tabs.values()].some(tab => tab.view.webContents === contents); }
  getTab(id) { return this.tabs.get(id) || null; }
  openPrivateTab() { return this.createTab(undefined, { isPrivate: true }); }
  snapshot() {
    return { activeId: this.activeId, tabs: [...this.tabs.values()].map(({ id, title, url, favicon, isHome, isLoading, error, isPrivate, muted, view }) => ({ id, title, url, favicon, isHome, isLoading, error, isPrivate, muted, zoom: view.webContents.isDestroyed() ? 1 : view.webContents.getZoomFactor(), canGoBack: !isHome && (Boolean(url) || !view.webContents.isDestroyed() && view.webContents.navigationHistory.canGoBack()), canGoForward: isHome ? Boolean(this.tabs.get(id)?.homeCanForward) : !view.webContents.isDestroyed() && view.webContents.navigationHistory.canGoForward() })) };
  }

  ownsWebContents(contents) {
    return [...this.tabs.values()].some(tab => tab.view.webContents === contents && !contents.isDestroyed());
  }

  emitState() { if (!this.window.isDestroyed()) this.onState(this.snapshot()); }

  destroy() {
    this.destroying = true;
    if ([...this.tabs.values()].some(tab => tab.isPrivate)) void this.privacy?.clearAllData(true);
    for (const tab of this.tabs.values()) {
      if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view);
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.destroy();
    }
    this.tabs.clear();
  }
}

module.exports = { BrowserTabManager, resolveAddress, isWebURL };
