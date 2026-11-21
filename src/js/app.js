import { toolbarMarkup } from './toolbar.js';
import { DEFAULT_SHORTCUTS, renderHome, tickClock } from './newtab.js';
import { renderSettings } from './settings.js';
import { renderLibrary } from './library.js';

const toolbarRoot = document.querySelector('#toolbar-root');
const viewRoot = document.querySelector('#view-root');
const toast = document.querySelector('#toast');
const desktop = window.ozinaDesktop;
const browser = desktop?.browser;
const prefs = { theme: 'dark', accent: '#C7FF55', ambient: true, font: 'Comfortaa', scale: 'comfortable', engine: 'DuckDuckGo', shortcuts: DEFAULT_SHORTCUTS, toolbarMode: 'always', ...JSON.parse(localStorage.getItem('ozina-preferences') || '{}') };
let tabs = [];
let activeId = null;
let browserState = { tabs: [], activeId: null };
let route = 'home';
let hideTimer;
let toastTimer;
let layoutFrame = 0;
const platform = desktop?.platform || 'darwin';
document.body.dataset.platform = platform;
document.body.dataset.windowDisplay = 'windowed';
desktop?.onWindowDisplayMode?.(mode => { document.body.dataset.windowDisplay = mode; });
desktop?.onShortcut?.(shortcut => {
  if (shortcut === 'focus-address') {
    showToolbar();
    const input = document.querySelector('#address-input');
    input?.focus(); input?.select();
  }
});

function persist() { localStorage.setItem('ozina-preferences', JSON.stringify(prefs)); }
function activeTab() { return tabs.find(tab => tab.id === activeId); }
function applyPrefs() {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.style.setProperty('--accent', prefs.accent);
  document.documentElement.style.setProperty('--pattern-opacity', prefs.ambient ? '.13' : '0');
  document.documentElement.style.setProperty('--font-ui', prefs.font === 'system' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : "'" + prefs.font + "', sans-serif");
  document.documentElement.style.setProperty('--type-md', prefs.scale === 'compact' ? '14px' : '15px');
}
function reportLayout() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    const toolbar = document.querySelector('.toolbar');
    const visible = toolbar && toolbar.classList.contains('is-visible');
    browser?.setLayout({ toolbarHeight: visible ? toolbar.offsetHeight : route === 'browser' ? 5 : 0 });
  });
}
function renderToolbar(preserveAddress = false) {
  const previousInput = document.querySelector('#address-input');
  const keepFocus = preserveAddress && previousInput === document.activeElement;
  const previousValue = keepFocus ? previousInput.value : '';
  const selection = keepFocus ? [previousInput.selectionStart, previousInput.selectionEnd] : null;
  toolbarRoot.innerHTML = toolbarMarkup(tabs, activeId, platform, route, prefs.toolbarMode);
  const input = document.querySelector('#address-input');
  const current = activeTab();
  if (keepFocus) {
    input.value = previousValue;
    input.focus();
    if (selection) input.setSelectionRange(...selection);
  } else {
    input.value = current && !current.isHome ? current.url : '';
  }
  document.querySelectorAll('.toolbar-navigation [data-action="back"]').forEach(button => { button.disabled = !current?.canGoBack; });
  document.querySelectorAll('.toolbar-navigation [data-action="forward"]').forEach(button => { button.disabled = !current?.canGoForward; });
  reportLayout();
}
function renderView() {
  if (route === 'browser') viewRoot.replaceChildren();
  else if (route === 'home') viewRoot.innerHTML = renderHome(prefs.shortcuts);
  else if (route === 'settings') viewRoot.innerHTML = renderSettings(prefs);
  else viewRoot.innerHTML = renderLibrary(route);
}
function render() { applyPrefs(); renderToolbar(); renderView(); }
function showToolbar() {
  clearTimeout(hideTimer);
  document.querySelector('.toolbar')?.classList.add('is-visible');
  reportLayout();
}
function scheduleHide() {
  if (prefs.toolbarMode === 'always') return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar?.matches(':hover') && !toolbar?.contains(document.activeElement) && !document.querySelector('#toolbar-menu:not([hidden])')) {
      toolbar?.classList.remove('is-visible');
      reportLayout();
    }
  }, 520);
}
function flash(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}
function syncPageVisibility() { browser?.setPageVisible(route === 'browser'); reportLayout(); }
function navigate(next) {
  route = next;
  renderToolbar();
  renderView();
  syncPageVisibility();
  showToolbar();
  document.querySelectorAll('[data-route]').forEach(button => button.classList.toggle('is-active', button.dataset.route === route));
}
function syncBrowserState(state) {
  const previousActive = activeId;
  const previousTab = tabs.find(tab => tab.id === previousActive);
  const previousRoute = route;
  browserState = state || browserState;
  tabs = browserState.tabs.map(tab => ({
    ...tab,
    mark: tab.title && tab.title !== 'New tab' ? tab.title.trim().slice(0, 1).toUpperCase() : 'O'
  }));
  activeId = browserState.activeId;
  const current = activeTab();
  const pageModeChanged = previousTab && current && previousTab.isHome !== current.isHome;
  if (current && (route === 'home' || route === 'browser' || previousActive !== activeId || pageModeChanged)) route = current.isHome ? 'home' : 'browser';
  renderToolbar(true);
  if (route !== previousRoute || previousActive !== activeId) renderView();
  if (route !== previousRoute || previousActive !== activeId) syncPageVisibility();
  if (current && !current.isHome) document.title = (current.title || current.url || 'New tab') + ' — OZINA';
  else document.title = 'OZINA — Less interface. More internet.';
  if (current?.error) flash(current.error);
}
async function navigateAddress(value) {
  const query = String(value || '').trim();
  if (!query || !browser) return;
  if (query.length > 4096) { flash('Address is too long.'); return; }
  document.querySelector('#address-input')?.blur();
  document.querySelector('#home-search-input')?.blur();
  const previousRoute = route;
  if (route !== 'browser') {
    route = 'browser'; renderToolbar(); renderView(); syncPageVisibility();
  }
  const result = await browser.navigate(query, prefs.engine);
  if (!result?.ok) {
    if (result?.invalid && previousRoute !== 'browser') {
      route = previousRoute; renderToolbar(); renderView(); syncPageVisibility();
    }
    flash(result?.error || 'Could not navigate to that address.');
  }
}
async function goHome() {
  await browser?.showHome();
  const current = activeTab();
  if (current) {
    current.isHome = true;
    current.canGoForward = Boolean(current.url);
  }
  route = 'home';
  renderToolbar();
  renderView();
  syncPageVisibility();
}
function createTab() { void browser?.createTab(); }
render();
window.addEventListener('resize', reportLayout);
const layoutObserver = new MutationObserver(reportLayout);
layoutObserver.observe(toolbarRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
browser?.onState(syncBrowserState);
browser?.getState().then(syncBrowserState).catch(error => flash(error.message));
setInterval(tickClock, 1000);

document.addEventListener('mousemove', event => { if (event.clientY <= 5) showToolbar(); });
document.addEventListener('mouseleave', scheduleHide);
document.addEventListener('keydown', event => {
  const modifier = platform === 'darwin' ? event.metaKey : event.ctrlKey;
  if (event.key === 'F11' || platform === 'darwin' && modifier && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    desktop?.toggleFullScreen?.();
  }
  if (modifier && event.key.toLowerCase() === 'l') {
    event.preventDefault(); showToolbar();
    const input = document.querySelector('#address-input');
    input?.focus(); input?.select();
  }
  if (modifier && event.key.toLowerCase() === 't') { event.preventDefault(); createTab(); }
  if (modifier && event.key.toLowerCase() === 'w') { event.preventDefault(); if (activeId) void browser?.closeTab(activeId); }
  if (modifier && event.key.toLowerCase() === 'r' || event.key === 'F5') { event.preventDefault(); void browser?.reload(); }
  if ((modifier || event.ctrlKey) && event.key === 'Tab' && tabs.length > 1) {
    event.preventDefault();
    const current = tabs.findIndex(tab => tab.id === activeId);
    const step = event.shiftKey ? -1 : 1;
    void browser?.activateTab(tabs[(current + step + tabs.length) % tabs.length].id);
  }
  if (modifier && /^[1-8]$/.test(event.key)) {
    const tab = tabs[Number(event.key) - 1];
    if (tab) { event.preventDefault(); void browser?.activateTab(tab.id); }
  }
  if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); void browser?.back(); }
  if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); void browser?.forward(); }
  if (event.key === 'Escape') {
    if (activeTab()?.isLoading) void browser?.stop();
    document.querySelector('#toolbar-menu')?.setAttribute('hidden', '');
    document.querySelector('#address-input')?.blur();
    scheduleHide();
  }
});
document.addEventListener('focusin', event => { if (event.target.closest('.toolbar')) showToolbar(); });
document.addEventListener('focusout', event => { if (event.target.closest('.toolbar')) scheduleHide(); });
document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const windowAction = event.target.closest('[data-window]')?.dataset.window;
  const routeButton = event.target.closest('[data-route]');
  const closeTab = event.target.closest('[data-close-tab]');
  const tabButton = event.target.closest('[data-tab]');
  const menuTrigger = event.target.closest('[data-menu]');
  if (windowAction) { desktop?.[windowAction === 'maximize' ? 'toggleMaximize' : windowAction]?.(); return; }
  if (menuTrigger) { const menu = document.querySelector('#toolbar-menu'); menu.hidden = !menu.hidden; showToolbar(); return; }
  if (routeButton) {
    navigate(routeButton.dataset.route);
    document.querySelector('#toolbar-menu')?.setAttribute('hidden', '');
    return;
  }
  if (action === 'home') { void goHome(); return; }
  if (action === 'new-tab') { createTab(); return; }
  if (closeTab) { void browser?.closeTab(closeTab.dataset.closeTab); return; }
  if (tabButton) { void browser?.activateTab(tabButton.dataset.tab); return; }
  if (action === 'back') { void browser?.back(); return; }
  if (action === 'forward') { void browser?.forward(); return; }
  if (action === 'reload') { void browser?.reload(); return; }
  if (action === 'stop') { void browser?.stop(); return; }
  if (action === 'bookmark') { event.target.closest('.tool-button')?.classList.toggle('is-saved'); flash('Bookmark management will be added in a later stage.'); return; }
  const shortcut = event.target.closest('[data-shortcut]');
  if (shortcut) { const item = prefs.shortcuts[Number(shortcut.dataset.shortcut)]; if (item) void navigateAddress(item.url); }
});
document.addEventListener('submit', event => {
  if (event.target.matches('#home-search')) {
    event.preventDefault();
    void navigateAddress(document.querySelector('#home-search-input').value);
  }
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'address-input' && event.key === 'Enter') {
    event.preventDefault();
    void navigateAddress(event.target.value);
  }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-pref="font"]')) { prefs.font = target.value; persist(); applyPrefs(); }
  if (target.matches('[data-pref="engine"]')) { prefs.engine = target.value; persist(); flash(target.value + ' selected'); }
});
document.addEventListener('click', event => {
  const target = event.target.closest('button[data-pref]');
  if (!target) return;
  const { pref, value } = target.dataset;
  if (pref === 'theme') prefs.theme = value;
  if (pref === 'accent') prefs.accent = value;
  if (pref === 'scale') prefs.scale = value;
  if (pref === 'toolbarMode') prefs.toolbarMode = value;
  persist(); renderView(); applyPrefs();
  if (pref === 'toolbarMode') { renderToolbar(); showToolbar(); scheduleHide(); }
  document.querySelectorAll('[data-pref="' + pref + '"]').forEach(button => {
    const currentValue = pref === 'theme' ? prefs.theme : pref === 'accent' ? prefs.accent : pref === 'toolbarMode' ? prefs.toolbarMode : prefs.scale;
    button.setAttribute('aria-pressed', String(button.dataset.value === currentValue));
  });
});
document.addEventListener('click', event => {
  const toggle = event.target.closest('.toggle');
  if (!toggle) return;
  prefs.ambient = !prefs.ambient;
  toggle.setAttribute('aria-checked', String(prefs.ambient));
  persist(); applyPrefs();
});
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-settings-section]');
  if (!nav) return;
  document.querySelectorAll('[data-settings-section]').forEach(button => button.classList.toggle('is-selected', button === nav));
  document.querySelectorAll('[data-settings-group]').forEach(section => { section.hidden = section.dataset.settingsGroup !== nav.dataset.settingsSection; });
});
