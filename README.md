# OZINA — Phase 1 visual prototype

OZINA is a desktop browser interface prototype built with Electron and plain HTML, CSS, and JavaScript. It does not load web pages or create Chromium tabs yet.

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

## Prototype interactions

- The toolbar stays visible by default. Choose **On demand** in Preferences to reveal it at the top edge and hide it after the pointer leaves.
- Press `Ctrl+L` on Windows/Linux or `⌘+L` on macOS to reveal and focus the address field.
- Press `Ctrl+T` or `⌘+T` to add a mock tab. Tab close and selection are interactive.
- The toolbar uses a two-row layout with address/search above the tabs; its address field keeps the existing `Ctrl/⌘+L` focus and mock search behavior.
- Search fields display a prototype confirmation; they do not send a network request.
- Back, forward, reload, bookmark, shortcuts, and downloads are mock controls.
- Appearance, accent, ambient texture, interface font, scale, and search engine preferences are saved in local storage.
- Preferences includes a shortcut manager for adding and removing up to eight new-tab shortcuts.
- Settings, bookmarks, history, and downloads are navigable from the toolbar menu.
- Window controls minimize, maximize, and close the Electron window through the limited preload bridge.

## Change the design

Start with `src/styles/colors.css` for the dark palette and `src/styles/themes.css` for light mode. `src/styles/global.css` holds spacing, radius, sizing, and motion tokens; `src/styles/typography.css` holds font and type scale tokens. Component styles are separated into `toolbar.css`, `tabs.css`, `newtab.css`, `settings.css`, and `animations.css`.

Most visual adjustments should be made by changing variables in those files. Runtime appearance preferences update the same CSS custom properties from `src/js/app.js`. Component markup is in `src/js/toolbar.js`, `tabs.js`, `newtab.js`, `settings.js`, and `library.js`; event behavior and route switching live in `src/js/app.js`.

Google Fonts requests Comfortaa for interface text and labels; the system font stacks provide fallbacks if it is unavailable offline.

## Electron security boundary

The renderer has Node integration disabled and context isolation enabled. `preload.js` exposes only the platform name and three native window actions. Future page rendering can be added in the main process using `WebContentsView` without exposing Node APIs to this interface.
