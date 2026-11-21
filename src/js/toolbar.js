import { icon } from './icons.js';
import { renderTabs } from './tabs.js';

export function toolbarMarkup(tabs, activeId, platform, route, toolbarMode = 'always') {
  const windows = platform === 'win32';
  const activeTab = tabs.find(tab => tab.id === activeId);
  const windowControls = windows
    ? '<div class="window-controls is-windows"><button class="window-control" data-window="minimize" aria-label="Minimize">−</button><button class="window-control" data-window="maximize" aria-label="Maximize">□</button><button class="window-control close" data-window="close" aria-label="Close">×</button></div>'
    : '<div class="window-controls"><button class="window-control close" data-window="close" aria-label="Close window"></button><button class="window-control minimize" data-window="minimize" aria-label="Minimize window"></button><button class="window-control maximize" data-window="maximize" aria-label="Maximize window"></button></div>';
  const toolbarVisibility = toolbarMode === 'always' ? ' is-visible' : '';
  const tabClass = tabs.length > 1 ? 'has-multiple-tabs' : 'has-single-tab';
  const tabRow = tabs.length > 1 ? `<div class="tab-row"><div class="tab-strip">${renderTabs(tabs, activeId)}</div></div>` : '';
  const backDisabled = !activeTab?.canGoBack;
  const forwardDisabled = !activeTab?.canGoForward;
  const refreshAction = activeTab?.isLoading ? 'stop' : 'reload';
  const refreshIcon = activeTab?.isLoading ? 'stop' : 'reload';
  const addressLabel = activeTab?.isHome ? '' : activeTab?.url || '';
  return `<div class="toolbar-edge" aria-hidden="true"></div><header class="toolbar ${tabClass}${toolbarVisibility}" id="toolbar" aria-label="Browser controls"><div class="toolbar-main"><div class="toolbar-leading">${windows ? '' : windowControls}<div class="toolbar-navigation" aria-label="Page navigation"><button class="tool-button" data-action="back" aria-label="Back" title="Back" ${backDisabled ? 'disabled' : ''}>${icon('back')}</button><button class="tool-button" data-action="forward" aria-label="Forward" title="Forward" ${forwardDisabled ? 'disabled' : ''}>${icon('forward')}</button></div></div><div class="address-wrap">${icon('search', 16)}<input id="address-input" class="address-input" aria-label="Address or search" placeholder="Search or enter address" value="${escapeAttribute(addressLabel)}" autocomplete="off" spellcheck="false"><span class="eyebrow">${windows ? 'Ctrl' : '⌘'} L</span></div><nav class="toolbar-actions" aria-label="Browser actions"><button class="tool-button" data-action="${refreshAction}" aria-label="${activeTab?.isLoading ? 'Stop loading' : 'Reload'}" title="${activeTab?.isLoading ? 'Stop' : 'Reload'}">${icon(refreshIcon)}</button><button class="tool-button" data-action="bookmark" aria-label="Bookmark" title="Bookmark">${icon('bookmark')}</button><button class="tool-button" data-route="downloads" aria-label="Downloads" title="Downloads">${icon('download')}</button>${route !== 'home' ? `<button class="tool-button" data-action="home" aria-label="Go to home screen" title="Home">${icon('home')}</button>` : ''}<button class="tool-button" data-menu="true" aria-label="Preferences menu" title="Preferences">${icon('settings')}</button><button class="tool-button tab-add" data-action="new-tab" aria-label="New tab" title="New tab">${icon('plus', 18)}</button>${windows ? windowControls : ''}</nav></div>${tabRow}<div id="toolbar-menu" class="toolbar-menu" hidden><button class="menu-item" data-route="bookmarks">${icon('bookmark', 16)} Bookmarks</button><button class="menu-item" data-route="history">${icon('clock', 16)} Browsing history</button><button class="menu-item" data-route="downloads">${icon('download', 16)} Downloads</button><button class="menu-item" data-route="settings">${icon('settings', 16)} Preferences</button></div></header>`;
}

function escapeAttribute(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
