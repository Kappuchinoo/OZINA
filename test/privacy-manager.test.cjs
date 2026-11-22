const test = require('node:test');
const assert = require('node:assert/strict');
const { PrivacyManager, originOf, API_PERMISSION_NAMES, PERMISSION_NAMES, DEFAULT_SETTINGS } = require('../privacy-manager');

function makeManager() {
  const manager = Object.create(PrivacyManager.prototype);
  Object.assign(manager, {
    sessions: new Map(), pending: new Map(), once: new WeakMap(), popups: new Map(), downloads: new Map(),
    screenSources: new Map(), bluetoothByContents: new WeakMap(), notificationOnce: new Map(), siteDecisions: {}, siteDevices: {}, siteZoom: {},
    settings: { ...DEFAULT_SETTINGS }, callbacks: { onPrompt: prompt => prompts.push(prompt) }, ownsContents: () => true,
    valid: () => true
  });
  const prompts = [];
  manager.callbacks.onPrompt = prompt => prompts.push(prompt);
  return { manager, prompts };
}

function fakeSession() {
  const values = { listeners: {}, webRequest: {} };
  for (const name of ['setPermissionCheckHandler', 'setPermissionRequestHandler', 'setDevicePermissionHandler', 'setDisplayMediaRequestHandler']) {
    values[name] = handler => { values[name] = handler; };
  }
  values.on = (name, handler) => { values.listeners[name] = handler; };
  values.webRequest.onBeforeSendHeaders = handler => { values.webRequest.beforeSendHeaders = handler; };
  values.webRequest.onHeadersReceived = handler => { values.webRequest.headersReceived = handler; };
  return values;
}

test('normalizes only HTTP and HTTPS origins', () => {
  assert.equal(originOf('https://example.test/a?q=1'), 'https://example.test');
  assert.equal(originOf('http://localhost:5173/'), 'http://localhost:5173');
  assert.equal(originOf('file:///tmp/page.html'), '');
  assert.equal(originOf('javascript:alert(1)'), '');
});

test('permission checks deny by default and cover each mapped Electron permission', () => {
  const { manager } = makeManager();
  const ses = fakeSession();
  manager.attachDeviceChoosers = () => {};
  manager.attachDownloadHandler = () => {};
  manager.attachCookieAndTrackingHandlers = () => {};
  manager.request = () => {};
  manager.requestScreenSource = () => {};
  manager.attach(ses, false);
  const contents = { getURL: () => 'https://ozina-test.example/page', session: ses, isDestroyed: () => false };

  for (const permission of Object.keys(API_PERMISSION_NAMES)) {
    assert.equal(ses.setPermissionCheckHandler(contents, permission, 'https://ozina-test.example', {}), false, `${permission} must default to Ask/deny`);
  }
  assert.equal(ses.setPermissionCheckHandler(contents, 'unknown-permission', 'https://ozina-test.example'), false);
  assert.equal(ses.setPermissionCheckHandler(null, 'notifications', 'https://ozina-test.example'), false, 'null WebContents must fail closed');
  manager.siteDecisions['https://ozina-test.example'] = { notifications: 'allow' };
  assert.equal(ses.setPermissionCheckHandler(null, 'notifications', 'https://ozina-test.example'), true, 'Electron notification checks without WebContents require a saved origin-specific choice');
});

test('request handler reaches OZINA choice flow for each supported resource', () => {
  const { manager } = makeManager();
  const ses = fakeSession();
  const requests = [];
  manager.valid = () => true;
  manager.request = (_contents, origin, names) => requests.push({ origin, names });
  manager.attachDeviceChoosers = () => {};
  manager.attachDownloadHandler = () => {};
  manager.attachCookieAndTrackingHandlers = () => {};
  manager.requestScreenSource = () => {};
  manager.attach(ses, false);
  const contents = { getURL: () => 'https://ozina-test.example/page', session: ses, isDestroyed: () => false };

  for (const [permission, names] of Object.entries(API_PERMISSION_NAMES)) {
    ses.setPermissionRequestHandler(contents, permission, () => {}, { requestingUrl: 'https://ozina-test.example/', mediaTypes: [] });
    assert.deepEqual(requests.pop().names, names, `${permission} should map to its user-facing permission names`);
  }
  ses.setPermissionRequestHandler(contents, 'media', () => {}, { requestingUrl: 'https://ozina-test.example/', mediaTypes: ['video', 'audio'] });
  assert.deepEqual(requests.pop().names, ['camera', 'microphone']);
  assert.equal(PERMISSION_NAMES.length, 12);

  let denied;
  ses.setPermissionRequestHandler(contents, 'unsupported-permission', value => { denied = value; }, { requestingUrl: 'https://ozina-test.example/' });
  assert.equal(denied, false);
  ses.setPermissionRequestHandler(contents, 'geolocation', value => { denied = value; }, { requestingUrl: 'https://attacker.example/' });
  assert.equal(denied, false, 'origin mismatch must be denied');
});

test('screen capture always uses an explicit source picker callback', () => {
  const { manager } = makeManager();
  const ses = fakeSession();
  manager.attachDeviceChoosers = () => {};
  manager.attachDownloadHandler = () => {};
  manager.attachCookieAndTrackingHandlers = () => {};
  let called = false;
  manager.requestScreenSource = (_session, request, callback) => { called = true; assert.equal(request.videoRequested, true); callback(null); };
  manager.attach(ses, false);
  let selected = 'not-called';
  ses.setDisplayMediaRequestHandler({ securityOrigin: 'https://ozina-test.example', videoRequested: true, frame: null }, value => { selected = value; });
  assert.equal(called, true);
  assert.equal(selected, null, 'no source is granted without an explicit selection');
});

test('device chooser UI is used and saved device grants are exact-device scoped', () => {
  const { manager, prompts } = makeManager();
  const ses = fakeSession();
  manager.attachDownloadHandler = () => {};
  manager.attachCookieAndTrackingHandlers = () => {};
  manager.requestScreenSource = () => {};
  manager.attach(ses, false);
  const contents = { getURL: () => 'https://ozina-test.example/', session: ses, isDestroyed: () => false, on() {} };
  let prevented = false;
  let chosen;
  ses.listeners['select-hid-device']({ preventDefault() { prevented = true; } }, { frame: { top: { webContents: contents } }, deviceList: [{ deviceId: 'hid-1', vendorId: 1, productId: 2, productName: 'Keyboard' }] }, value => { chosen = value; });
  assert.equal(prevented, true);
  assert.equal(prompts.at(-1).kind, 'device');
  const id = prompts.at(-1).id;
  manager.resolveDevicePrompt(id, 'allow-site', 'hid-1');
  assert.equal(chosen, 'hid-1');
  const device = { deviceId: 'hid-1', vendorId: 1, productId: 2 };
  const otherDevice = { deviceId: 'hid-2', vendorId: 1, productId: 3 };
  assert.equal(ses.setDevicePermissionHandler({ origin: 'https://ozina-test.example', deviceType: 'hid', device }), true);
  assert.equal(ses.setDevicePermissionHandler({ origin: 'https://ozina-test.example', deviceType: 'hid', device: otherDevice }), false);
});

test('permission changes are origin-specific and private decisions never overwrite regular decisions', () => {
  const { manager } = makeManager();
  const normal = fakeSession();
  const privateSession = fakeSession();
  manager.sessions.set(normal, { isPrivate: false, decisions: {}, devices: {} });
  manager.sessions.set(privateSession, { isPrivate: true, decisions: {}, devices: {} });
  manager.siteDecisions['https://ozina-test.example'] = { notifications: 'allow' };
  const contents = { session: privateSession, getURL: () => 'https://ozina-test.example/page' };
  const result = manager.setSitePermission(contents, 'notifications', 'block');
  assert.equal(result.ok, true);
  assert.equal(manager.siteDecision(privateSession, 'https://ozina-test.example', 'notifications'), 'block');
  assert.equal(manager.siteDecision(normal, 'https://ozina-test.example', 'notifications'), 'allow');
  assert.equal(manager.setSitePermission(contents, 'usb', 'allow').ok, false, 'hardware grants must name a device');
});

test('pop-ups and automatic downloads stay blocked or paused until an explicit choice', () => {
  const { manager, prompts } = makeManager();
  const ses = fakeSession();
  manager.attachDeviceChoosers = () => {};
  manager.attachCookieAndTrackingHandlers = () => {};
  manager.requestScreenSource = () => {};
  manager.attach(ses, false);
  const contents = { session: ses, getURL: () => 'https://ozina-test.example/page', isDestroyed: () => false };
  let opened = false;
  manager.callbacks.onOpenPopup = () => { opened = true; };
  assert.equal(manager.handlePopup(contents, 'https://target.example/'), false);
  const popup = prompts.at(-1);
  assert.equal(popup.kind, 'popup');
  manager.resolvePopup(popup.id, 'allow-once');
  assert.equal(opened, true);

  let paused = false;
  let resumed = false;
  let cancelled = false;
  const item = { pause() { paused = true; }, resume() { resumed = true; }, cancel() { cancelled = true; }, getFilename: () => 'file.zip' };
  ses.listeners['will-download']({}, item, contents);
  assert.equal(paused, true);
  assert.equal(resumed, false);
  assert.equal(prompts.at(-1).kind, 'download');
  manager.resolveDownload(prompts.at(-1).id, 'allow-once');
  assert.equal(resumed, true);
  assert.equal(cancelled, false);
});

test('cookie, DNT, GPC, and tracker settings modify actual session requests', () => {
  const { manager } = makeManager();
  const ses = fakeSession();
  manager.attachDeviceChoosers = () => {};
  manager.attachDownloadHandler = () => {};
  manager.requestScreenSource = () => {};
  manager.attach(ses, false);
  manager.settings = { ...DEFAULT_SETTINGS, thirdPartyCookies: 'block', doNotTrack: true, globalPrivacyControl: true };

  let sent;
  ses.webRequest.beforeSendHeaders({ initiatorOrigin: 'https://publisher.example', url: 'https://ads.example/pixel', requestHeaders: { Cookie: 'sid=1' } }, result => { sent = result; });
  assert.equal(sent.requestHeaders.Cookie, undefined);
  assert.equal(sent.requestHeaders.DNT, '1');
  assert.equal(sent.requestHeaders['Sec-GPC'], '1');

  let sameSite;
  ses.webRequest.beforeSendHeaders({ initiatorOrigin: 'https://shop.example.test', url: 'https://images.example.test/photo', requestHeaders: { Cookie: 'same-site=1' } }, result => { sameSite = result; });
  assert.equal(sameSite.requestHeaders.Cookie, 'same-site=1', 'subdomains within one schemeful site keep their cookies');

  let received;
  ses.webRequest.headersReceived({ initiatorOrigin: 'https://publisher.example', url: 'https://ads.example/pixel', responseHeaders: { 'Set-Cookie': ['sid=1'] } }, result => { received = result; });
  assert.equal(received.responseHeaders['Set-Cookie'], undefined);
  manager.settings.trackingProtection = true;
  let blocked;
  ses.webRequest.beforeSendHeaders({ initiatorOrigin: 'https://publisher.example', url: 'https://google-analytics.com/collect', requestHeaders: {} }, result => { blocked = result; });
  assert.equal(blocked.cancel, true);
});
