function escapeHTML(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function safeFavicon(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function renderTabs(tabs, activeId) {
  return tabs.map(tab => {
    const title = escapeHTML(tab.title || 'New tab');
    const favicon = safeFavicon(tab.favicon);
    const mark = escapeHTML(tab.mark || title.slice(0, 1));
    const errorTitle = tab.error ? title + ' — ' + escapeHTML(tab.error) : title;
    return `<button class="tab ${tab.id === activeId ? 'is-active' : ''} ${tab.isPrivate ? 'is-private' : ''}" data-tab="${escapeHTML(tab.id)}" title="${errorTitle}" aria-label="${tab.isPrivate ? 'Private tab: ' : ''}${title}"><span class="tab-mark ${tab.isLoading ? 'is-loading' : ''} ${tab.error ? 'has-error' : ''}">${favicon ? `<img src="${escapeHTML(favicon)}" alt="" />` : mark}${tab.isLoading ? '<i class="tab-spinner" aria-hidden="true"></i>' : ''}</span><span class="tab-title">${tab.isPrivate ? 'Private · ' : ''}${title}</span><span class="tab-close" data-close-tab="${escapeHTML(tab.id)}" aria-label="Close ${title}"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6m0-6L3 9" /></svg></span></button>`;
  }).join('');
}
