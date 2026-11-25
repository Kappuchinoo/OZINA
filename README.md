# OZINA — Chromium browser

OZINA is an Electron desktop browser. The OZINA interface remains in its existing HTML, CSS, and JavaScript renderer.

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
- Click the shield inside the address field to open OZINA CONTROL. It shows the current site, HTTPS status, permission choices, cookies, cookie policies, privacy signals, tracker blocking, and site-data actions.
- Permissions default to Ask/deny. Requests for camera, microphone, location, notifications, clipboard, display capture, Bluetooth, USB, Serial, HID, pop-ups, and automatic downloads use OZINA prompts or explicit device/source selection. Unknown permission requests are denied.
- “Allow on this site” choices and privacy settings are encrypted with Electron `safeStorage` in the application data folder. “Allow this time” decisions live only for the current page, and private-session decisions never use the persistent decision store.
- First-party and third-party cookie controls remove cookie request/response headers through Electron `webRequest`. The default is to allow both. Sites may malfunction when cookie blocking is enabled; use OZINA CONTROL to change the setting.
