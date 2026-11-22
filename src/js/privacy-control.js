import { icon } from './icons.js';

const permissionLabels = [
  ['camera', 'Camera'], ['microphone', 'Microphone'], ['geolocation', 'Location'],
  ['notifications', 'Notifications'], ['screen', 'Screen sharing'], ['clipboard', 'Clipboard'],
  ['bluetooth', 'Bluetooth'], ['usb', 'USB devices'], ['serial', 'Serial devices'],
  ['hid', 'HID devices'], ['popups', 'Pop-ups'], ['automaticDownloads', 'Automatic downloads']
];
const permissionMeaning = {
  camera: 'capture video from your camera', microphone: 'capture audio from your microphone',
  geolocation: 'read your approximate or precise location', notifications: 'show notifications from this site',
  screen: 'capture the screen or a selected window', clipboard: 'read clipboard contents',
  bluetooth: 'connect to a Bluetooth device you select', usb: 'connect to a USB device you select',
  serial: 'connect to a serial device you select', hid: 'connect to an HID device you select',
  popups: 'open a new tab or pop-up window', automaticDownloads: 'download files without another prompt'
};
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderPrivacyControl(state, open = false) {
  if (!open) return '';
  if (!state?.origin) return `<aside class="oz-control-panel is-empty" role="dialog" aria-label="OZINA CONTROL"><header class="oz-control-head"><div><span class="eyebrow">OZINA / CONTROL</span><h2>Site controls</h2></div><button class="tool-button" data-privacy-close aria-label="Close privacy controls">${icon('close')}</button></header><p>Open a website to view its connection and permissions.</p><button class="privacy-action" data-privacy-private>Open a private tab</button></aside>`;
  const permissions = permissionLabels.map(([key, label]) => {
    const value = state.permissions?.[key] || 'ask';
    const deviceRule = ['bluetooth', 'usb', 'serial', 'hid'].includes(key);
    return `<label class="privacy-permission"><span>${label}</span><select data-privacy-permission="${key}" aria-label="${label} permission"><option value="ask" ${value === 'ask' ? 'selected' : ''}>Ask</option><option value="allow" ${value === 'allow' ? 'selected' : ''} ${deviceRule ? 'disabled' : ''}>Allow</option><option value="block" ${value === 'block' ? 'selected' : ''}>Block</option></select></label>`;
  }).join('');
  const settings = state.settings || {};
  return `<aside class="oz-control-panel" role="dialog" aria-label="OZINA CONTROL"><header class="oz-control-head"><div><span class="eyebrow">OZINA / CONTROL</span><h2>Site controls</h2></div><button class="tool-button" data-privacy-close aria-label="Close privacy controls">${icon('close')}</button></header>
    <div class="privacy-origin"><span class="privacy-status ${state.secure ? 'is-secure' : 'is-insecure'}"></span><div><strong>${escape(state.origin)}</strong><small>${state.secure ? 'HTTPS · Chromium certificate validation enabled' : 'Connection is not HTTPS'}</small></div></div>
    <section class="privacy-section"><div class="privacy-section-title">PERMISSIONS <span>${state.isPrivate ? 'PRIVATE SESSION' : 'SITE RULES'}</span></div><div class="privacy-permission-list">${permissions}</div><small class="privacy-note">OS status — camera ${escape(state.osMedia?.camera || 'OS managed')}, microphone ${escape(state.osMedia?.microphone || 'OS managed')}, screen ${escape(state.osMedia?.screen || 'OS managed')}. Blocking a permission prevents new access; reload to stop an active stream.</small><button class="privacy-text-action" data-privacy-reset>Reset site permissions</button></section>
    <section class="privacy-section"><div class="privacy-section-title">COOKIES & SITE DATA</div><div class="privacy-summary">${state.cookieCount} cookies on this site <span>${state.isPrivate ? 'Temporary' : 'Stored by Chromium'}</span></div><details class="privacy-cookie-list"><summary>View cookie names</summary>${state.cookies?.length ? state.cookies.map(cookie => `<div class="privacy-cookie-row"><span>${escape(cookie.name)}</span><small>${cookie.secure ? 'Secure' : 'Standard'}${cookie.httpOnly ? ' · HttpOnly' : ''}</small></div>`).join('') : '<p>No cookies found for this site.</p>'}</details><div class="privacy-toggle-row"><span>First-party cookies</span><button class="privacy-chip" data-privacy-setting="firstPartyCookies" data-value="${settings.firstPartyCookies === 'block' ? 'allow' : 'block'}">${settings.firstPartyCookies === 'block' ? 'Blocked' : 'Allowed'}</button></div><div class="privacy-toggle-row"><span>Third-party cookies</span><button class="privacy-chip" data-privacy-setting="thirdPartyCookies" data-value="${settings.thirdPartyCookies === 'block' ? 'allow' : 'block'}">${settings.thirdPartyCookies === 'block' ? 'Blocked' : 'Allowed'}</button></div><button class="privacy-action" data-privacy-clear-site>Clear this website’s data</button></section>
    <section class="privacy-section"><div class="privacy-section-title">TRACKING SIGNALS</div><div class="privacy-toggle-row"><span>Do Not Track</span><button class="privacy-chip ${settings.doNotTrack ? 'is-on' : ''}" data-privacy-setting="doNotTrack" data-value="${!settings.doNotTrack}">${settings.doNotTrack ? 'On' : 'Off'}</button></div><div class="privacy-toggle-row"><span>Global Privacy Control</span><button class="privacy-chip ${settings.globalPrivacyControl ? 'is-on' : ''}" data-privacy-setting="globalPrivacyControl" data-value="${!settings.globalPrivacyControl}">${settings.globalPrivacyControl ? 'On' : 'Off'}</button></div><div class="privacy-toggle-row"><span>Tracker blocking</span><button class="privacy-chip ${settings.trackingProtection ? 'is-on' : ''}" data-privacy-setting="trackingProtection" data-value="${!settings.trackingProtection}">${settings.trackingProtection ? 'On' : 'Off'}</button></div><small class="privacy-note">These signals request privacy; sites may ignore them.</small></section>
    <section class="privacy-section privacy-bottom-actions"><button class="privacy-action" data-privacy-clear-all>Clear all browsing data</button><button class="privacy-action" data-privacy-private>Open a private tab</button></section>
  </aside>`;
}

export function renderPrivacyPrompt(prompt) {
  if (!prompt) return '';
  if (prompt.kind === 'screen-os-blocked') return `<div class="privacy-prompt-wrap"><section class="privacy-prompt" role="dialog" aria-modal="true"><span class="eyebrow">OZINA / SYSTEM ACCESS</span><h2>Screen recording is blocked</h2><p>macOS reports screen access as <strong>${escape(prompt.status)}</strong>. Allow OZINA under System Settings → Privacy &amp; Security → Screen Recording, then try again.</p><button class="privacy-action" data-screen-cancel>Understood</button></section></div>`;
  if (prompt.kind === 'screen') {
    const sources = (prompt.choices || []).map(source => `<button class="screen-source" data-screen-source="${escape(source.id)}"><span class="screen-preview">${source.thumbnail ? `<img src="${escape(source.thumbnail)}" alt="" />` : icon('display')}</span><span>${escape(source.label)}</span></button>`).join('');
    return `<div class="privacy-prompt-wrap"><section class="privacy-prompt" role="dialog" aria-modal="true" aria-labelledby="privacy-prompt-title"><span class="eyebrow">OZINA / SCREEN SHARE</span><h2 id="privacy-prompt-title">Choose what to share</h2><p><strong>${escape(prompt.origin)}</strong> wants to capture a screen or window. Choose a source to continue; nothing is shared until you select one.</p><div class="screen-source-grid">${sources || '<p>No shareable screens or windows were found.</p>'}</div><button class="privacy-action" data-screen-cancel>Cancel</button></section></div>`;
  }
  if (prompt.kind === 'device') {
    const rows = (prompt.choices || []).map(device => `<label class="device-choice"><input type="radio" name="device-choice" value="${escape(device.id)}" /><span>${escape(device.label)}</span></label>`).join('');
    return `<div class="privacy-prompt-wrap"><section class="privacy-prompt" role="dialog" aria-modal="true" aria-labelledby="privacy-prompt-title"><span class="eyebrow">OZINA / DEVICE ACCESS</span><h2 id="privacy-prompt-title">Choose a device</h2><p><strong>${escape(prompt.origin)}</strong> requests access to a ${escape(prompt.deviceKind)} device. Select a device to give this tab access.</p><div class="device-choice-list">${rows || '<p>No available devices were found.</p>'}</div><div class="privacy-prompt-actions"><button data-privacy-choice="allow-once">Allow this time</button><button data-privacy-choice="allow-site">Allow on this site</button><button data-privacy-choice="block">Block</button></div></section></div>`;
  }
  const meta = prompt.kind === 'popup' ? ` wants to open a pop-up for ${escape(prompt.target || 'another website')}.` : prompt.kind === 'download' ? ` wants to download “${escape(prompt.fileName)}”.` : ` wants to use ${escape((prompt.names || []).join(', '))}.`;
  const permissionDetail = prompt.kind === 'permission'
    ? `<p>Granting this lets the site ${escape((prompt.names || []).map(name => permissionMeaning[name] || name).join(' and '))}. You can change the site rule in OZINA CONTROL. macOS may also ask for system approval for camera or microphone access.</p>` : '';
  return `<div class="privacy-prompt-wrap"><section class="privacy-prompt" role="dialog" aria-modal="true" aria-labelledby="privacy-prompt-title"><span class="eyebrow">OZINA / SITE REQUEST</span><h2 id="privacy-prompt-title">Allow access?</h2><p><strong>${escape(prompt.origin)}</strong>${meta}</p>${permissionDetail}<p class="privacy-note">${prompt.isPrivate ? 'This private-session choice will not be saved.' : 'Choose whether to remember your decision for this site.'}</p><div class="privacy-prompt-actions"><button data-privacy-choice="allow-once">Allow this time</button><button data-privacy-choice="allow-site">Allow on this site</button><button data-privacy-choice="block">Block</button></div></section></div>`;
}
