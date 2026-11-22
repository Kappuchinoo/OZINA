const { app, desktopCapturer, safeStorage, systemPreferences, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PERMISSION_NAMES = [
  'camera', 'microphone', 'geolocation', 'notifications', 'screen', 'clipboard',
  'popups', 'automaticDownloads', 'bluetooth', 'usb', 'serial', 'hid'
];
const TRACKER_HOSTS = new Set([
  'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
  'connect.facebook.net', 'pixel.facebook.com', 'hotjar.com', 'mixpanel.com'
]);
const MULTI_LABEL_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.cn', 'co.jp', 'co.in', 'co.za']);
const DEFAULT_SETTINGS = Object.freeze({
  firstPartyCookies: 'allow', thirdPartyCookies: 'allow', doNotTrack: true,
  globalPrivacyControl: false, trackingProtection: false
});
const API_PERMISSION_NAMES = {
  geolocation: ['geolocation'], 'geolocation-approximate': ['geolocation'], notifications: ['notifications'],
  'display-capture': ['screen'], 'clipboard-read': ['clipboard'], 'deprecated-sync-clipboard-read': ['clipboard'],
  popups: ['popups'], 'automatic-downloads': ['automaticDownloads'], bluetooth: ['bluetooth'],
  usb: ['usb'], serial: ['serial'], hid: ['hid'], midi: ['bluetooth'], midiSysex: ['bluetooth']
};

function originOf(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch { return ''; }
}

function normalizedPermission(name) {
  return name === 'screen' || name === 'display-capture' ? 'screen'
    : name === 'automatic-downloads' ? 'automaticDownloads'
      : name === 'media' ? 'camera' : name;
}

function withoutHeader(headers, name) {
  for (const key of Object.keys(headers)) if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
}

function siteKey(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const labels = host.split('.');
    const suffix = labels.slice(-2).join('.');
    const suffixLabels = MULTI_LABEL_SUFFIXES.has(suffix) ? 3 : 2;
    const domain = host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':') ? host : labels.slice(-suffixLabels).join('.');
    return `${url.protocol}//${domain}`;
  } catch { return ''; }
}

class PrivacyManager {
  constructor(window, ownsContents, callbacks = {}) {
    this.window = window;
    this.ownsContents = ownsContents;
    this.callbacks = callbacks;
    this.sessions = new Map();
    this.pending = new Map();
    this.once = new WeakMap();
    this.notificationOnce = new Map();
    this.popups = new Map();
    this.downloads = new Map();
    this.screenSources = new Map();
    this.bluetoothByContents = new WeakMap();
    this.siteDecisions = {};
    this.siteDevices = {};
    this.siteZoom = {};
    this.settings = { ...DEFAULT_SETTINGS };
    this.file = path.join(app.getPath('userData'), 'ozina-privacy.bin');
    this.read();
  }

  read() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return;
      const data = JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file)));
      if (data && typeof data === 'object') {
        this.siteDecisions = data.siteDecisions || {};
        this.siteDevices = data.siteDevices || {};
        this.siteZoom = data.siteZoom || {};
        this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      }
    } catch {}
  }

  save() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const temp = this.file + '.tmp';
      fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify({ siteDecisions: this.siteDecisions, siteDevices: this.siteDevices, siteZoom: this.siteZoom, settings: this.settings })), { mode: 0o600 });
      fs.renameSync(temp, this.file);
      return true;
    } catch { return false; }
  }

  sessionFor(isPrivate = false) {
    return isPrivate ? session.fromPartition('temp:ozina-private') : session.defaultSession;
  }

  attach(ses, isPrivate = false) {
    if (this.sessions.has(ses)) return;
    this.sessions.set(ses, { isPrivate, decisions: {}, devices: {} });
    ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details = {}) => {
      const origin = originOf(requestingOrigin || details.securityOrigin || details.requestingUrl);
      // Electron omits WebContents for some notification checks. Only a saved,
      // origin-bound notification choice is considered in that API case.
      if (!contents) {
        if (permission !== 'notifications' || !origin) return false;
        if (this.siteDecision(ses, origin, 'notifications') === 'allow') return true;
        const record = this.notificationOnce.get(ses)?.get(origin);
        return Boolean(record && !record.contents.isDestroyed() && originOf(record.contents.getURL()) === origin);
      }
      if (!this.valid(contents, origin, ses)) return false;
      if (permission === 'media') {
        const requested = details.mediaTypes || [];
        if (!requested.length) return false;
        return requested.every(type => this.checkDecision(ses, contents, origin, type === 'video' ? 'camera' : type === 'audio' ? 'microphone' : 'unsupported'));
      }
      const names = API_PERMISSION_NAMES[permission];
      if (!names) return false;
      if (!names.length) return false;
      return names.every(name => this.checkDecision(ses, contents, origin, name));
    });
    ses.setPermissionRequestHandler((contents, permission, callback, details = {}) => {
      const origin = originOf(details.requestingUrl || details.requestingOrigin || contents?.getURL());
      if (!this.valid(contents, origin, ses)) return callback(false);
      if (permission === 'media') {
        const requested = details.mediaTypes || [];
        const names = requested.map(type => type === 'video' ? 'camera' : type === 'audio' ? 'microphone' : 'unsupported');
        if (!names.length || names.includes('unsupported')) return callback(false);
        return this.request(contents, origin, names, callback);
      }
      const names = API_PERMISSION_NAMES[permission];
      if (!names || !names.length) return callback(false);
      return this.request(contents, origin, names, callback);
    });
    ses.setDevicePermissionHandler?.(({ origin: rawOrigin, deviceType, device }) => {
      const origin = originOf(rawOrigin);
      if (!origin || !device) return false;
      return this.deviceGrantsFor(ses, origin, deviceType).includes(this.deviceFingerprint(deviceType, device));
    });
    ses.setDisplayMediaRequestHandler?.((request, callback) => this.requestScreenSource(ses, request, callback), { useSystemPicker: false });
    this.attachDeviceChoosers(ses);
    this.attachDownloadHandler(ses);
    this.attachCookieAndTrackingHandlers(ses);
  }

  valid(contents, origin, ses) {
    return Boolean(contents && !contents.isDestroyed() && this.ownsContents(contents) && contents.session === ses && origin && originOf(contents.getURL()) === origin);
  }

  siteDecision(ses, origin, name) {
    const key = normalizedPermission(name);
    const decisions = this.sessions.get(ses)?.isPrivate ? this.sessions.get(ses)?.decisions : this.siteDecisions;
    return decisions?.[origin]?.[key] || (this.deviceGrantsFor(ses, origin, key).length ? 'allow' : 'ask');
  }

  deviceGrantsFor(ses, origin, kind) {
    return this.sessions.get(ses)?.isPrivate ? this.sessions.get(ses)?.devices?.[origin]?.[kind] || [] : this.siteDevices[origin]?.[kind] || [];
  }

  deviceFingerprint(kind, device) {
    const stableId = device.serialNumber ? `serial:${device.serialNumber}` : `id:${device.deviceId || device.portId || ''}`;
    return `${kind}:${device.vendorId || ''}:${device.productId || ''}:${stableId}`;
  }

  checkDecision(ses, contents, origin, name) {
    if (name === 'unsupported' || name === 'screen') return false;
    const saved = this.siteDecision(ses, origin, name);
    if (saved === 'allow') return true;
    if (saved === 'block') return false;
    return Boolean(this.once.get(contents)?.[origin]?.[name]);
  }

  onNavigation(contents, url) {
    this.once.delete(contents);
    const currentOrigin = originOf(url);
    const notifications = this.notificationOnce.get(contents.session);
    for (const [origin, record] of notifications || []) if (record.contents === contents && currentOrigin !== origin) notifications.delete(origin);
    const origin = currentOrigin;
    if (origin && !this.sessions.get(contents.session)?.isPrivate && this.siteZoom[origin]) contents.setZoomFactor(this.siteZoom[origin]);
  }

  setSiteZoom(contents, factor) {
    const origin = originOf(contents?.getURL());
    if (!origin || !this.ownsContents(contents) || this.sessions.get(contents.session)?.isPrivate) return;
    this.siteZoom[origin] = factor;
    this.save();
  }

  request(contents, origin, names, callback) {
    const ses = contents.session;
    const decisions = names.map(name => this.siteDecision(ses, origin, name));
    if (decisions.some(value => value === 'block')) return callback(false);
    if (names.every(name => this.checkDecision(ses, contents, origin, name))) {
      if (names.some(name => ['camera', 'microphone'].includes(name))) {
        return this.confirmOSMedia(contents, origin, names).then(ok => callback(Boolean(ok && this.valid(contents, origin, ses))));
      }
      if (!names.includes('screen')) return callback(true);
    }
    const id = randomUUID();
    this.pending.set(id, { kind: 'permission', contents, origin, names, callback, ses });
    this.callbacks.onPrompt?.({ id, kind: 'permission', origin, names, isPrivate: this.sessions.get(ses)?.isPrivate || false });
    const timer = setTimeout(() => this.resolvePrompt(id, 'block'), 60000);
    timer.unref?.();
  }

  async confirmOSMedia(contents, origin, names) {
    if (process.platform !== 'darwin') return true;
    for (const name of names.filter(value => value === 'camera' || value === 'microphone')) {
      const type = name === 'camera' ? 'camera' : 'microphone';
      const status = systemPreferences.getMediaAccessStatus(type);
      if (status === 'denied' || status === 'restricted') { this.callbacks.onNotice?.(`macOS ${type} access is ${status}. Enable it in System Settings.`); return false; }
      if (status !== 'granted' && !await systemPreferences.askForMediaAccess(type)) { this.callbacks.onNotice?.(`macOS denied ${type} access. Enable it in System Settings.`); return false; }
      if (contents.isDestroyed() || originOf(contents.getURL()) !== origin) return false;
    }
    return true;
  }

  setSitePermission(contents, name, value) {
    const origin = originOf(contents?.getURL());
    const ses = contents?.session;
    const normalized = normalizedPermission(name);
    if (!origin || !this.ownsContents(contents) || !PERMISSION_NAMES.includes(normalized) || !['allow', 'block', 'ask'].includes(value)) return { ok: false, error: 'Invalid site permission request.' };
    const isPrivate = this.sessions.get(ses)?.isPrivate;
    if (['usb', 'hid', 'serial', 'bluetooth'].includes(normalized) && value === 'allow') return { ok: false, error: 'Choose a specific device from the website request before allowing hardware access.' };
    this.once.delete(contents);
    const decisions = isPrivate ? this.sessions.get(ses).decisions : this.siteDecisions;
    decisions[origin] ||= {};
    if (value === 'ask') delete decisions[origin][normalized];
    else decisions[origin][normalized] = value;
    if (Object.keys(decisions[origin]).length === 0) delete decisions[origin];
    const devices = isPrivate ? this.sessions.get(ses).devices : this.siteDevices;
    if (['usb', 'hid', 'serial', 'bluetooth'].includes(normalized) && devices[origin]) {
      delete devices[origin][normalized];
      if (Object.keys(devices[origin]).length === 0) delete devices[origin];
    }
    if (!isPrivate) this.save();
    this.callbacks.onChanged?.(origin);
    return { ok: true, origin, permission: normalized, value };
  }

  resetSite(contents) {
    const origin = originOf(contents?.getURL());
    if (!origin || !this.ownsContents(contents)) return { ok: false, error: 'No website is active.' };
    const isPrivate = this.sessions.get(contents.session)?.isPrivate;
    if (isPrivate) { delete this.sessions.get(contents.session).decisions[origin]; delete this.sessions.get(contents.session).devices[origin]; }
    else { delete this.siteDecisions[origin]; delete this.siteDevices[origin]; }
    this.once.delete?.(contents);
    this.save();
    return { ok: true, origin };
  }

  attachDeviceChoosers(ses) {
    const chooser = (kind, event, details, callback, choices) => {
      event.preventDefault();
      const contents = details.webContents || details.frame?.top?.webContents || null;
      const origin = originOf(details.securityOrigin || details.origin || details.requestingUrl || contents?.getURL());
      if (!this.valid(contents, origin, ses) || !choices?.length) return callback(kind === 'serial' ? '' : undefined);
      const id = randomUUID();
      this.pending.set(id, { kind: 'device', deviceKind: kind, contents, origin, callback, choices, ses });
      this.callbacks.onPrompt?.({ id, kind: 'device', origin, deviceKind: kind, choices: choices.map(choice => ({ id: choice.deviceId || choice.portId, label: choice.productName || choice.displayName || `${choice.vendorId || ''} ${choice.productId || ''}`.trim() || 'Device' })), isPrivate: this.sessions.get(ses)?.isPrivate || false });
      const timer = setTimeout(() => this.resolvePrompt(id, 'block'), 60000);
      timer.unref?.();
    };
    ses.on('select-hid-device', (event, details, callback) => chooser('hid', event, details, callback, details.deviceList?.map(device => ({ ...device, deviceId: device.deviceId }))));
    ses.on('select-usb-device', (event, details, callback) => chooser('usb', event, details, callback, details.deviceList?.map(device => ({ ...device, deviceId: device.deviceId }))));
    ses.on('select-serial-port', (event, ports, contents, callback) => chooser('serial', event, { webContents: contents, securityOrigin: contents?.getURL() }, callback, ports?.map(port => ({ ...port, portId: port.portId }))));
  }

  attachContents(contents) {
    contents.once('destroyed', () => {
      this.cancelForContents(contents);
      const notifications = this.notificationOnce.get(contents.session);
      for (const [origin, record] of notifications || []) if (record.contents === contents) notifications.delete(origin);
    });
    contents.on('select-bluetooth-device', (event, devices, callback) => {
      event.preventDefault();
      const origin = originOf(contents.getURL());
      if (!this.valid(contents, origin, contents.session)) return callback('');
      let id = this.bluetoothByContents.get(contents);
      let item = id && this.pending.get(id);
      if (!item) {
        id = randomUUID();
        item = { kind: 'device', deviceKind: 'bluetooth', contents, origin, callback, choices: [], ses: contents.session };
        this.pending.set(id, item);
        this.bluetoothByContents.set(contents, id);
      }
      item.callback = callback;
      item.choices = (devices || []).map(device => ({ ...device, deviceId: device.deviceId }));
      this.callbacks.onPrompt?.({ id, kind: 'device', origin, deviceKind: 'bluetooth', choices: item.choices.map(device => ({ id: device.deviceId, label: device.deviceName || device.deviceId || 'Bluetooth device' })), isPrivate: this.sessions.get(contents.session)?.isPrivate || false });
      clearTimeout(item.timer);
      item.timer = setTimeout(() => this.resolveDevicePrompt(id, 'block', ''), 60000);
      item.timer.unref?.();
    });
  }

  resolveDevice(item, choice) {
    if (choice === 'block' || !this.valid(item.contents, item.origin, item.ses)) return ['serial', 'bluetooth'].includes(item.deviceKind) ? item.callback('') : item.callback(undefined);
    const id = String(choice || '');
    const selected = item.choices.find(device => (device.deviceId || device.portId) === id);
    if (!selected) return ['serial', 'bluetooth'].includes(item.deviceKind) ? item.callback('') : item.callback(undefined);
    const grants = this.once.get(item.contents) || {};
    grants[item.origin] ||= {};
    grants[item.origin][item.deviceKind] = true;
    this.once.set(item.contents, grants);
    item.callback(item.deviceKind === 'serial' ? selected.portId : selected.deviceId);
  }

  resolveDevicePrompt(id, action, deviceId) {
    const item = this.pending.get(id);
    if (!item || item.kind !== 'device') return false;
    this.pending.delete(id);
    this.bluetoothByContents.delete(item.contents);
    const selected = item.choices.find(device => (device.deviceId || device.portId) === deviceId);
    if (action === 'allow-site' && selected && this.valid(item.contents, item.origin, item.ses)) {
      const isPrivate = this.sessions.get(item.ses)?.isPrivate;
      const devices = isPrivate ? this.sessions.get(item.ses).devices : this.siteDevices;
      devices[item.origin] ||= {};
      devices[item.origin][item.deviceKind] ||= [];
      const fingerprint = this.deviceFingerprint(item.deviceKind, selected);
      if (!devices[item.origin][item.deviceKind].includes(fingerprint)) devices[item.origin][item.deviceKind].push(fingerprint);
      if (!isPrivate) this.save();
    }
    this.resolveDevice(item, action === 'block' ? 'block' : deviceId);
    this.callbacks.onChanged?.(item.origin);
    return true;
  }

  async requestScreenSource(ses, request, callback) {
    const contents = request.frame?.top?.webContents || null;
    const origin = originOf(request.securityOrigin);
    if (!this.valid(contents, origin, ses) || !request.videoRequested) return callback(null);
    const screenStatus = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'system-managed';
    if (['denied', 'restricted'].includes(screenStatus)) {
      this.callbacks.onPrompt?.({ id: randomUUID(), kind: 'screen-os-blocked', origin, status: screenStatus });
      return callback(null);
    }
    let sources;
    try { sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 260, height: 160 }, fetchWindowIcons: true }); }
    catch { return callback(null); }
    if (!sources.length || !this.valid(contents, origin, ses)) return callback(null);
    const id = randomUUID();
    this.screenSources.set(id, { contents, origin, callback, ses, sources });
    this.callbacks.onPrompt?.({ id, kind: 'screen', origin, choices: sources.map(source => ({ id: source.id, label: source.name, thumbnail: source.thumbnail?.toDataURL?.() || '' })), isPrivate: this.sessions.get(ses)?.isPrivate || false });
    const timer = setTimeout(() => this.resolveScreen(id, ''), 60000);
    timer.unref?.();
  }

  resolveScreen(id, sourceId) {
    const item = this.screenSources.get(id);
    if (!item) return false;
    this.screenSources.delete(id);
    const source = item.sources.find(entry => entry.id === sourceId);
    if (!source || !this.valid(item.contents, item.origin, item.ses)) item.callback(null);
    else item.callback({ video: source });
    return true;
  }

  cancelForContents(contents) {
    let cancelled = false;
    for (const [id, item] of this.pending) if (item.contents === contents) {
      if (item.kind === 'device') this.resolveDevicePrompt(id, 'block', '');
      else this.resolvePrompt(id, 'block');
      cancelled = true;
    }
    for (const [id, item] of this.popups) if (item.contents === contents) { this.resolvePopup(id, 'block'); cancelled = true; }
    for (const [id, item] of this.downloads) if (item.contents === contents) { this.resolveDownload(id, 'block'); cancelled = true; }
    for (const [id, item] of this.screenSources) if (item.contents === contents) { this.resolveScreen(id, ''); cancelled = true; }
    return cancelled;
  }

  resolvePrompt(id, choice) {
    const item = this.pending.get(id);
    if (!item || !['allow-once', 'allow-site', 'block'].includes(choice)) return false;
    this.pending.delete(id);
    if (item.kind === 'device') { this.resolveDevice(item, choice); return true; }
    let allowed = choice !== 'block' && this.valid(item.contents, item.origin, item.ses);
    const finish = result => {
      const isPrivate = this.sessions.get(item.ses)?.isPrivate;
      if (choice === 'allow-site' && result) {
        const decisions = isPrivate ? this.sessions.get(item.ses).decisions : this.siteDecisions;
        decisions[item.origin] ||= {};
        for (const name of item.names) decisions[item.origin][name] = 'allow';
        if (!isPrivate) this.save();
      } else if (choice === 'block') {
        const decisions = isPrivate ? this.sessions.get(item.ses).decisions : this.siteDecisions;
        decisions[item.origin] ||= {};
        for (const name of item.names) decisions[item.origin][name] = 'block';
        if (!isPrivate) this.save();
      }
      if (result && choice === 'allow-once') {
        const grants = this.once.get(item.contents) || {};
        grants[item.origin] ||= {};
        for (const name of item.names) grants[item.origin][name] = true;
        this.once.set(item.contents, grants);
        if (item.names.includes('notifications')) {
          let notifications = this.notificationOnce.get(item.ses);
          if (!notifications) this.notificationOnce.set(item.ses, notifications = new Map());
          notifications.set(item.origin, { contents: item.contents });
        }
      }
      try { item.callback(Boolean(result)); } catch {}
      this.callbacks.onChanged?.(item.origin);
    };
    if (allowed && item.names.some(name => name === 'camera' || name === 'microphone')) {
      this.confirmOSMedia(item.contents, item.origin, item.names).then(finish);
    } else finish(allowed);
    return true;
  }

  resolvePopup(id, choice) {
    const item = this.popups.get(id);
    if (!item) return false;
    this.popups.delete(id);
    if (choice === 'allow-site') this.setSitePermission(item.contents, 'popups', 'allow');
    if (choice !== 'block' && this.valid(item.contents, item.origin, item.contents.session)) this.callbacks.onOpenPopup?.(item.url, item.contents);
    return true;
  }

  handlePopup(contents, url) {
    const origin = originOf(contents?.getURL());
    if (!isWebURL(url) || !this.ownsContents(contents) || !origin) return false;
    const status = this.siteDecision(contents.session, origin, 'popups');
    if (status === 'allow') { this.callbacks.onOpenPopup?.(url, contents); return true; }
    if (status === 'block') return false;
    const id = randomUUID();
    this.popups.set(id, { contents, origin, url });
    this.callbacks.onPrompt?.({ id, kind: 'popup', origin, target: originOf(url), isPrivate: this.sessions.get(contents.session)?.isPrivate || false });
    return false;
  }

  attachDownloadHandler(ses) {
    ses.on('will-download', (event, item, contents) => {
      const origin = originOf(contents?.getURL());
      if (!this.valid(contents, origin, ses)) { item.cancel(); return; }
      const decision = this.siteDecision(ses, origin, 'automaticDownloads');
      if (decision === 'allow') return;
      if (decision === 'block') { item.cancel(); return; }
      item.pause();
      const id = randomUUID();
      this.downloads.set(id, { item, contents, origin, ses });
      this.callbacks.onPrompt?.({ id, kind: 'download', origin, fileName: item.getFilename(), isPrivate: this.sessions.get(ses)?.isPrivate || false });
      const timer = setTimeout(() => this.resolveDownload(id, 'block'), 60000);
      timer.unref?.();
    });
  }

  resolveDownload(id, choice) {
    const item = this.downloads.get(id);
    if (!item) return false;
    this.downloads.delete(id);
    const valid = this.valid(item.contents, item.origin, item.ses);
    if (choice === 'allow-site' && valid) this.setSitePermission(item.contents, 'automaticDownloads', 'allow');
    if (['allow-once', 'allow-site'].includes(choice) && valid) item.item.resume();
    else item.item.cancel();
    return true;
  }

  attachCookieAndTrackingHandlers(ses) {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      const settings = this.settings;
      if (settings.doNotTrack) headers.DNT = '1'; else withoutHeader(headers, 'DNT');
      if (settings.globalPrivacyControl) headers['Sec-GPC'] = '1'; else withoutHeader(headers, 'Sec-GPC');
      const initiator = originOf(details.initiatorOrigin || details.referrer);
      const target = originOf(details.url);
      const isThirdParty = initiator && target && siteKey(initiator) !== siteKey(target);
      const cookieMode = isThirdParty ? settings.thirdPartyCookies : settings.firstPartyCookies;
      if (cookieMode === 'block') withoutHeader(headers, 'Cookie');
      if (settings.trackingProtection && this.isTracker(details.url)) { callback({ cancel: true }); return; }
      callback({ requestHeaders: headers });
    });
    ses.webRequest.onHeadersReceived((details, callback) => {
      const initiator = originOf(details.initiatorOrigin || details.referrer);
      const target = originOf(details.url);
      const isThirdParty = initiator && target && siteKey(initiator) !== siteKey(target);
      const cookieMode = isThirdParty ? this.settings.thirdPartyCookies : this.settings.firstPartyCookies;
      const responseHeaders = { ...details.responseHeaders };
      if (cookieMode === 'block') withoutHeader(responseHeaders, 'Set-Cookie');
      callback({ responseHeaders });
    });
  }

  isTracker(value) {
    try { const host = new URL(value).hostname.toLowerCase(); return [...TRACKER_HOSTS].some(domain => host === domain || host.endsWith('.' + domain)); }
    catch { return false; }
  }

  async updateSettings(values) {
    if (!values || typeof values !== 'object') return { ...this.settings };
    if (['allow', 'block'].includes(values.firstPartyCookies)) this.settings.firstPartyCookies = values.firstPartyCookies;
    if (['allow', 'block'].includes(values.thirdPartyCookies)) this.settings.thirdPartyCookies = values.thirdPartyCookies;
    if (typeof values.doNotTrack === 'boolean') this.settings.doNotTrack = values.doNotTrack;
    if (typeof values.globalPrivacyControl === 'boolean') this.settings.globalPrivacyControl = values.globalPrivacyControl;
    if (typeof values.trackingProtection === 'boolean') this.settings.trackingProtection = values.trackingProtection;
    this.save();
    return { ...this.settings };
  }

  async getSiteState(contents) {
    const origin = originOf(contents?.getURL());
    if (!origin || !this.ownsContents(contents)) return { origin: '', secure: false, permissions: {}, cookieCount: 0, cookies: [], isPrivate: false, settings: { ...this.settings } };
    const ses = contents.session;
    const isPrivate = this.sessions.get(ses)?.isPrivate || false;
    let cookies = [];
    try { cookies = await ses.cookies.get({ url: origin }); } catch {}
    const permissions = Object.fromEntries(PERMISSION_NAMES.map(name => {
      const saved = this.siteDecision(ses, origin, name);
      const current = saved === 'ask' && this.once.get(contents)?.[origin]?.[name] ? 'allow' : saved;
      return [name, current];
    }));
    const osMedia = process.platform === 'darwin' ? {
      camera: systemPreferences.getMediaAccessStatus('camera'), microphone: systemPreferences.getMediaAccessStatus('microphone'), screen: systemPreferences.getMediaAccessStatus('screen')
    } : { camera: 'system-managed', microphone: 'system-managed', screen: 'system-managed' };
    return {
      origin, secure: origin.startsWith('https:'), certificate: origin.startsWith('https:') ? 'validated-by-chromium' : 'not-secure',
      permissions, osMedia, cookies: cookies.map(cookie => ({ name: cookie.name, domain: cookie.domain, path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly })),
      cookieCount: cookies.length, isPrivate, settings: { ...this.settings }
    };
  }

  async clearSiteData(contents) {
    const origin = originOf(contents?.getURL());
    if (!origin || !this.ownsContents(contents)) return { ok: false, error: 'No website is active.' };
    await contents.session.clearStorageData({ origin });
    return { ok: true, origin };
  }

  async clearAllData(isPrivate = false) {
    const ses = this.sessionFor(isPrivate);
    await ses.clearStorageData();
    await ses.clearCache();
    if (isPrivate) { const entry = this.sessions.get(ses); if (entry) { entry.decisions = {}; entry.devices = {}; } }
    return { ok: true };
  }

  close() {
    for (const id of [...this.pending.keys()]) this.resolvePrompt(id, 'block');
    for (const [id, item] of this.popups) { this.popups.delete(id); void item; }
    for (const id of this.downloads.keys()) this.resolveDownload(id, 'block');
    for (const id of this.screenSources.keys()) this.resolveScreen(id, '');
  }
}

function isWebURL(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

module.exports = { PrivacyManager, originOf, PERMISSION_NAMES, API_PERMISSION_NAMES, DEFAULT_SETTINGS };
