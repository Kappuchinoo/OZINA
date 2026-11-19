import { toolbarMarkup } from './toolbar.js';
import { DEFAULT_SHORTCUTS, renderHome, tickClock } from './newtab.js';
import { renderSettings } from './settings.js';
import { renderLibrary } from './library.js';

const toolbarRoot = document.querySelector('#toolbar-root');
const viewRoot = document.querySelector('#view-root');
const toast = document.querySelector('#toast');
const prefs = { theme: 'dark', accent: '#C7FF55', ambient: true, font: 'Comfortaa', scale: 'comfortable', engine: 'DuckDuckGo', shortcuts: DEFAULT_SHORTCUTS, toolbarMode: 'always', ...JSON.parse(localStorage.getItem('ozina-preferences') || '{}') };
let tabs = [{ id: 1, title: 'New tab', mark: 'O' }], activeId = 1, route = 'home', hideTimer, toastTimer;
const platform = window.ozinaDesktop?.platform || 'darwin';
document.body.dataset.platform = platform;
document.body.dataset.windowDisplay = 'windowed';
window.ozinaDesktop?.onWindowDisplayMode?.(mode => { document.body.dataset.windowDisplay = mode; });
function persist() { localStorage.setItem('ozina-preferences', JSON.stringify(prefs)); }
function applyPrefs() { document.documentElement.dataset.theme = prefs.theme; document.documentElement.style.setProperty('--accent', prefs.accent); document.documentElement.style.setProperty('--pattern-opacity', prefs.ambient ? '.13' : '0'); document.documentElement.style.setProperty('--font-ui', prefs.font === 'system' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : `'${prefs.font}', sans-serif`); document.documentElement.style.setProperty('--type-md', prefs.scale === 'compact' ? '14px' : '15px'); }
function renderToolbar() { toolbarRoot.innerHTML = toolbarMarkup(tabs, activeId, platform, route, prefs.toolbarMode); }
function renderView() { viewRoot.innerHTML = route === 'home' ? renderHome(prefs.shortcuts) : route === 'settings' ? renderSettings(prefs) : renderLibrary(route); }
function render() { applyPrefs(); renderToolbar(); renderView(); }
function showToolbar() { clearTimeout(hideTimer); document.querySelector('.toolbar')?.classList.add('is-visible'); }
function scheduleHide() { if (prefs.toolbarMode === 'always') return; clearTimeout(hideTimer); hideTimer = setTimeout(() => { const toolbar = document.querySelector('.toolbar'); if (!toolbar?.matches(':hover') && !toolbar?.contains(document.activeElement) && !document.querySelector('#toolbar-menu:not([hidden])')) toolbar?.classList.remove('is-visible'); }, 520); }
function flash(message) { toast.textContent = message; toast.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200); }
function navigate(next) { route = next; renderToolbar(); renderView(); showToolbar(); document.querySelectorAll('[data-route]').forEach(b => b.classList.toggle('is-active', b.dataset.route === route)); }
function submitSearch(value) { const query = value.trim(); if (!query) return; flash(`Prototype search · ${query}`); document.querySelector('#address-input')?.blur(); document.querySelector('#home-search-input')?.blur(); }
function newTab() { const id = Date.now(); tabs.push({ id, title: 'New tab', mark: 'O' }); activeId = id; route = 'home'; render(); }
render(); setInterval(tickClock, 1000);
document.addEventListener('mousemove', event => { if (event.clientY <= 5) showToolbar(); });
document.addEventListener('mouseleave', scheduleHide);
document.addEventListener('keydown', event => {
  if (event.key === 'F11') { event.preventDefault(); window.ozinaDesktop?.toggleFullScreen?.(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); showToolbar(); document.querySelector('#address-input')?.focus(); document.querySelector('#address-input')?.select(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 't') { event.preventDefault(); newTab(); }
  if (event.key === 'Escape') { document.querySelector('#toolbar-menu')?.setAttribute('hidden',''); document.querySelector('#address-input')?.blur(); scheduleHide(); }
});
document.addEventListener('focusin', event => { if (event.target.closest('.toolbar')) showToolbar(); });
document.addEventListener('focusout', event => { if (event.target.closest('.toolbar')) scheduleHide(); });
document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const windowAction = event.target.closest('[data-window]')?.dataset.window;
  const routeButton = event.target.closest('[data-route]');
  const removeShortcut = event.target.closest('[data-remove-shortcut]');
  const menuTrigger = event.target.closest('[data-menu]');
  const closeTab = event.target.closest('[data-close-tab]');
  const tabButton = event.target.closest('[data-tab]');
  if (windowAction) { window.ozinaDesktop?.[windowAction === 'maximize' ? 'toggleMaximize' : windowAction]?.(); return; }
  if (menuTrigger) { const menu = document.querySelector('#toolbar-menu'); menu.hidden = !menu.hidden; showToolbar(); return; }
  if (routeButton) { navigate(routeButton.dataset.route); document.querySelector('#toolbar-menu').hidden = true; return; }
  if (action === 'home') { navigate('home'); return; }
  if (action === 'toggle-shortcuts') { const manager = document.querySelector('#shortcut-manager'); manager.hidden = !manager.hidden; event.target.closest('[data-action]').setAttribute('aria-expanded', String(!manager.hidden)); return; }
  if (removeShortcut) { prefs.shortcuts.splice(Number(removeShortcut.dataset.removeShortcut), 1); persist(); renderView(); return; }
  if (closeTab) { const id = Number(closeTab.dataset.closeTab); tabs = tabs.filter(t => t.id !== id); if (!tabs.length) return newTab(); if (activeId === id) { activeId = tabs[0].id; route = 'home'; } render(); return; }
  if (tabButton) { activeId = Number(tabButton.dataset.tab); route = 'home'; render(); return; }
  if (action === 'new-tab') { newTab(); return; }
  if (action === 'back' || action === 'forward' || action === 'reload') { flash(`${action[0].toUpperCase()+action.slice(1)} is a browser prototype control`); return; }
  if (action === 'bookmark') { event.target.closest('.tool-button').classList.toggle('is-saved'); flash('Saved to bookmarks · prototype'); return; }
  const shortcut = event.target.closest('[data-shortcut]');
  if (shortcut) { const item = prefs.shortcuts[Number(shortcut.dataset.shortcut)]; if (item) flash(`Would open ${item.url} · prototype`); }
});
document.addEventListener('submit', event => {
  if (event.target.matches('#home-search')) { event.preventDefault(); submitSearch(document.querySelector('#home-search-input').value); }
  if (event.target.matches('#shortcut-form')) {
    event.preventDefault();
    if (prefs.shortcuts.length >= 8) return;
    const form = event.target;
    const name = form.elements.name.value.trim();
    let url = form.elements.url.value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    prefs.shortcuts.push({ name, url, mark: name.slice(0, 1).toUpperCase() });
    persist(); renderView();
    document.querySelector('#shortcut-manager').hidden = false;
    document.querySelector('[data-action="toggle-shortcuts"]').setAttribute('aria-expanded', 'true');
  }
});
document.addEventListener('keydown', event => { if (event.target.id === 'address-input' && event.key === 'Enter') { event.preventDefault(); submitSearch(event.target.value); } });
document.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-pref="font"]')) { prefs.font = target.value; persist(); applyPrefs(); }
  if (target.matches('[data-pref="engine"]')) { prefs.engine = target.value; persist(); flash(`${target.value} selected · prototype`); }
});
document.addEventListener('click', event => {
  const target = event.target.closest('button[data-pref]'); if (!target) return;
  const { pref, value } = target.dataset;
  if (pref === 'theme') prefs.theme = value;
  if (pref === 'accent') prefs.accent = value;
  if (pref === 'scale') prefs.scale = value;
  if (pref === 'toolbarMode') prefs.toolbarMode = value;
  persist(); renderView(); applyPrefs();
  if (pref === 'toolbarMode') { renderToolbar(); showToolbar(); scheduleHide(); }
  document.querySelectorAll(`[data-pref="${pref}"]`).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === (pref === 'theme' ? prefs.theme : pref === 'accent' ? prefs.accent : pref === 'toolbarMode' ? prefs.toolbarMode : prefs.scale))));
});
document.addEventListener('click', event => { const toggle = event.target.closest('.toggle'); if (!toggle) return; prefs.ambient = !prefs.ambient; toggle.setAttribute('aria-checked', String(prefs.ambient)); persist(); applyPrefs(); });
document.addEventListener('click', event => { const nav = event.target.closest('[data-settings-section]'); if (!nav) return; document.querySelectorAll('[data-settings-section]').forEach(button => button.classList.toggle('is-selected', button === nav)); document.querySelectorAll('[data-settings-group]').forEach(section => { section.hidden = section.dataset.settingsGroup !== nav.dataset.settingsSection; }); });
