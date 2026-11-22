# OZINA — Stage 3 Chromium browser

OZINA is an Electron desktop browser. Each browser tab uses an Electron `WebContentsView`; the OZINA interface remains in its existing HTML, CSS, and JavaScript renderer.

## Run it

1. Install Node.js (an active LTS release) if it is not already installed.
2. In this folder, install the project dependency:

   ```sh
   npm install
   ```

3. Launch the desktop app:

   ```sh
   npm start
   ```

`node_modules` is intentionally ignored by Git; each developer recreates it with `npm install`.

## Browser controls

- The toolbar stays visible by default. Choose **On demand** in Preferences to reveal it at the top edge and hide it after the pointer leaves.
- Press `Ctrl+L` on Windows/Linux or `⌘+L` on macOS to reveal and focus the address field.
- Press `Ctrl+T` or `⌘+T` to add a browser tab. Tab close and selection are interactive.
- Enter a URL or search phrase in the address field. Bare domains get `https://`; non-address text uses the search engine selected in Preferences.
- Page state, navigation history, title, favicon, loading state, back, forward, reload, and stop are kept per tab.
- Press `Ctrl/⌘+W` to close the active tab, `Ctrl/⌘+Tab` to switch tabs, and `Ctrl/⌘+1` through `8` to select a tab. Press F11 on Windows or `Ctrl+⌘+F` on macOS for fullscreen.
- Press `Ctrl/⌘+Shift+N` to open an isolated private tab. Private tabs use an in-memory `temp:` partition; their site storage and cookies are cleared after the last private tab closes.
- Press `Ctrl/⌘+F` to find text on the current page. Mute and zoom controls are in the toolbar menu; zoom preferences are saved per site.
- The toolbar uses a two-row layout with address/search above the tabs. `Ctrl/⌘+L` focuses the address field.
- Back, forward, reload, stop, and tab controls drive Chromium. Bookmarks, history, and download management remain later-stage layouts; actual downloads are paused for user permission.
- Appearance, accent, ambient texture, interface font, scale, and search engine preferences are saved in local storage.
- Preferences includes a shortcut manager for adding and removing up to eight new-tab shortcuts.
- Settings, bookmarks, history, and downloads are navigable from the toolbar menu.
- Window controls minimize, maximize, and close the Electron window through the limited preload bridge.

## Change the design

Start with `src/styles/colors.css` for the dark palette and `src/styles/themes.css` for light mode. `src/styles/global.css` holds spacing, radius, sizing, and motion tokens; `src/styles/typography.css` holds font and type scale tokens. Component styles are separated into `toolbar.css`, `tabs.css`, `newtab.css`, `settings.css`, and `animations.css`.

Most visual adjustments should be made by changing variables in those files. Runtime appearance preferences update the same CSS custom properties from `src/js/app.js`. Component markup is in `src/js/toolbar.js`, `tabs.js`, `newtab.js`, `settings.js`, and `library.js`; event behavior and route switching live in `src/js/app.js`.

Google Fonts requests Comfortaa for interface text and labels; the system font stacks provide fallbacks if it is unavailable offline.

## OZINA CONTROL and privacy

- Click the shield inside the address field to open OZINA CONTROL. It shows the current site, HTTPS status, permission choices, cookies, cookie policies, privacy signals, tracker blocking, and site-data actions.
- Permissions default to Ask/deny. Requests for camera, microphone, location, notifications, clipboard, display capture, Bluetooth, USB, Serial, HID, pop-ups, and automatic downloads use OZINA prompts or explicit device/source selection. Unknown permission requests are denied.
- “Allow on this site” choices and privacy settings are encrypted with Electron `safeStorage` in the application data folder. “Allow this time” decisions live only for the current page, and private-session decisions never use the persistent decision store.
- First-party and third-party cookie controls remove cookie request/response headers through Electron `webRequest`. The default is to allow both. Sites may malfunction when cookie blocking is enabled; use OZINA CONTROL to change the setting.
- Do Not Track and Global Privacy Control are sent as request headers when enabled. Websites can ignore these signals. OZINA does not promise anonymity.
- Tracker blocking is off by default and currently uses the small, built-in host list in `privacy-manager.js`; it is not a comprehensive or remotely updated blocklist.
- Clear website data clears cookies and origin-scoped web storage. Chromium cookie removal follows registrable-domain matching and can include subdomains. Electron does not expose a per-origin cache clear here, so that action does not clear cached files. Clear all browsing data also clears the session cache.
- Blocking a site permission prevents new requests, but an existing camera or microphone stream may continue until the page is reloaded. OS-level camera/microphone permissions must also be managed in system settings.
- macOS camera/microphone prompts require `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` in the packaged app’s `Info.plist`; screen sharing also depends on the user granting Screen Recording access in System Settings. This repo has no packaging pipeline yet. Windows OS privacy controls are enforced by Chromium/Windows and cannot be queried by this Electron API.
- Electron exposes HTTPS status and applies normal certificate validation. OZINA does not override certificate errors; detailed certificate-chain inspection is not currently exposed by this interface.

Run the focused privacy tests with:

```sh
npm test
```

The tests use mocked Electron session and device events. They do not replace platform testing with real cameras, microphones, displays, or attached hardware.

## Electron security boundary

The OZINA renderer has Node integration disabled, context isolation enabled, and sandboxing. `preload.js` exposes a narrow allowlisted browser/window/privacy bridge. Website tabs use separate `WebContentsView` instances with no OZINA preload, Node integration disabled, context isolation enabled, and sandboxing. IPC handlers accept commands only from the trusted OZINA window. Permission origins and WebContents are checked before grants; certificate errors are not bypassed.

Bookmarks, history, and downloads remain outside Stage 3 and are not connected to the Chromium session yet.
