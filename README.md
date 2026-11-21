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
- The toolbar uses a two-row layout with address/search above the tabs. `Ctrl/⌘+L` focuses the address field.
- Back, forward, reload, stop, and tab controls drive Chromium. Bookmarks, history, and downloads remain their existing later-stage layouts.
- Appearance, accent, ambient texture, interface font, scale, and search engine preferences are saved in local storage.
- Preferences includes a shortcut manager for adding and removing up to eight new-tab shortcuts.
- Settings, bookmarks, history, and downloads are navigable from the toolbar menu.
- Window controls minimize, maximize, and close the Electron window through the limited preload bridge.

## Change the design

Start with `src/styles/colors.css` for the dark palette and `src/styles/themes.css` for light mode. `src/styles/global.css` holds spacing, radius, sizing, and motion tokens; `src/styles/typography.css` holds font and type scale tokens. Component styles are separated into `toolbar.css`, `tabs.css`, `newtab.css`, `settings.css`, and `animations.css`.

Most visual adjustments should be made by changing variables in those files. Runtime appearance preferences update the same CSS custom properties from `src/js/app.js`. Component markup is in `src/js/toolbar.js`, `tabs.js`, `newtab.js`, `settings.js`, and `library.js`; event behavior and route switching live in `src/js/app.js`.

Google Fonts requests Comfortaa for interface text and labels; the system font stacks provide fallbacks if it is unavailable offline.

## Electron security boundary

The OZINA renderer has Node integration disabled, context isolation enabled, and sandboxing. `preload.js` exposes a narrow allowlisted browser/window bridge. Website tabs use separate `WebContentsView` instances with no OZINA preload, Node integration disabled, context isolation enabled, and sandboxing. IPC handlers accept commands only from the trusted OZINA window. Website permissions are denied by default; popups are opened as validated web tabs, and certificate errors are not bypassed.

Bookmarks, history, and downloads remain outside Stage 3 and are not connected to the Chromium session yet.
