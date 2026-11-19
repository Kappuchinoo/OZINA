export function renderTabs(tabs, activeId) {
  return tabs.map(tab => `<button class="tab ${tab.id === activeId ? 'is-active' : ''}" data-tab="${tab.id}" title="${tab.title}"><span class="site-avatar" style="width:16px;height:16px;border-radius:4px;font-size:8px">${tab.mark}</span><span class="tab-title">${tab.title}</span>${tabs.length > 1 ? `<span class="tab-close" data-close-tab="${tab.id}" aria-label="Close ${tab.title}">×</span>` : ''}</button>`).join('');
}
