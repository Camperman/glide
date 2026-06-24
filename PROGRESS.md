# Glide — Progress

Loop-maintained status of the phased build (see REQUIREMENTS.md §5).
Legend: ✅ done & verified · 🔧 in progress · ⬜ not started

| Phase | Title | Status |
|---|---|---|
| 0 | Scaffold & boot | ✅ |
| 1 | One isolated account view | ✅ |
| 2 | Multiple accounts + sidebar switching + isolation proof | ✅ |
| 3 | Persistence | ✅ |
| 4 | Account management UI (add/remove/edit) | ✅ |
| 5 | Browser chrome (navigation) | ✅ |
| 6 | Visual identity + unread badges | ✅ |
| 7 | Notifications + keyboard shortcuts | ✅ (1 sub-item deferred — see note) |
| 8 | Local macOS packaging (Glide.app) | ✅ |
| 9 | Per-profile shortcuts bar | ✅ |
| 10 | Shortcuts → persistent tabs (lazy, closeable) | ✅ |
| 11 | General browser tabs (tab strip, + new tab, any URL) | ✅ |
| 13 | App rail + favicons + per-app badges | ✅ |
| 12 | Multiple windows (Cmd-N) | ✅ |

## Next up
**First complete cut (Phases 0–7) is done.** Remaining work is optional polish
(Phase 8+ in REQUIREMENTS.md §5) — only build on request. Candidates: notification
click-to-switch (see deferral note below), per-account mute/notification rules,
remember scroll position, zoom, download handling, auto-fetched Google avatars.

### Known limitation — sign-in
**Passkey-over-Bluetooth ("hybrid"/caBLE) is not supported.** It depends on
full Apple Developer-ID signing + notarization + hardened runtime, which a
locally-built, ad-hoc-signed app doesn't have (granting the Bluetooth TCC
permission is necessary but not sufficient). **Sign in with a non-Bluetooth
method instead** — on Google's "Something went wrong / Make sure Bluetooth is
on" screen, click **Try another way** → "Tap Yes on your phone" (internet-based,
not BLE) / authenticator code / password / backup code. Sessions persist, so
this is one-time per account. Revisit only if we ever add Developer-ID signing.

### Future feature — Chrome extension support (scoped, not built)
The user wants this eventually (relies on: an **ad blocker** uBlock/AdBlock, a
**password manager** 1Password/Bitwarden, **productivity** Grammarly/Loom).
Recommended path = "Tier 2": add **electron-chrome-extensions** (+
`electron-chrome-web-store` for installs), build a browser-action toolbar +
popups in our chrome, manage installs per profile (per session partition), and
**upgrade Electron 33 → 35+** (needed for Manifest V3 service workers). Caveats:
not all extensions work (deep `webRequest`/`declarativeNetRequest`/native-
messaging ones may be partial), and it's ongoing maintenance tied to Chromium.
Native Electron `session.loadExtension` is the cheap "Tier 1" fallback for
sideloading one unpacked extension, but only supports a subset of APIs.

### Deferred from Phase 7 (intentional)
**Notification click → switch to that account.** Reliable mapping of an HTML5
`Notification` click back to its originating account requires injecting script
into the Google page (e.g. wrapping `window.Notification`). That means a preload
on the account views — which REQUIREMENTS.md §4.1/§7 explicitly forbid (account
views are untrusted remote content: no preload, no node integration). Rather than
violate that hard constraint, this is left for a future decision. The background-
activity signal it was meant to provide is already covered by the live unread
badges (Phase 6). If wanted, revisit as Phase 8 with a minimal, notification-only
isolated preload as a conscious, documented tradeoff.

## Pending manual checks (need a real Google login)
- **Phase 1:** Run `npm start`, log into Gmail in the account pane, quit, relaunch
  → should still be logged in (confirms the `persist:` partition survives restart).
  Also confirm the pane resizes with the window.
- **Phase 2:** With the 3 seed accounts, click each sidebar avatar → the visible
  Google session switches instantly and the active avatar is highlighted.
  Switching back is instant (background views stay loaded, no reload). Logging
  into one account does not affect the others (the automated isolation test
  already proves the cookie-level guarantee).
- **Phase 3:** Navigate each account somewhere specific (e.g. Calendar, Drive),
  resize/move the window, quit, relaunch → same accounts on the same pages, same
  active account, same window geometry. Then quit, delete
  `~/Library/Application Support/Glide/glide-state.json`, relaunch → clean start
  with the 3 default accounts (no crash).
- **Phase 4:** Click `[+]`, add an account (label/color/URL) → it appears, becomes
  active, and works; survives restart. Right-click → Edit changes label/color
  (reflected immediately + after restart). Right-click → Remove deletes it from
  the sidebar and disk; re-adding the same account requires a fresh Google login
  (session was wiped). Confirm it all works with ≥4 accounts at once.
- **Phase 5:** In one account, type `calendar.google.com` in the address bar →
  navigates there, still logged into that same account; repeat for Drive/Docs.
  Back/forward/reload work and enable/disable correctly. Switch accounts → the
  address bar swaps to the other account's current URL. A Google popup (e.g.
  compose-in-new-window or an OAuth prompt) opens logged into the same account.
- **Phase 6:** With Gmail logged in, a sidebar avatar shows a red unread badge
  matching the inbox's `Inbox (N)` count; read/receive mail → the badge updates
  live, including for accounts you aren't currently viewing; clears at zero.
- **Phase 9/10:** With a profile active, click Mail then Calendar then back to Mail
  → Mail is NOT reloaded (it stayed live in its tab). The active pill is
  highlighted; open pills show an ×. Click × (or right-click → Close tab) → that
  tab unloads (reopening reloads it). `[+]` adds a shortcut; right-click → Edit/
  Remove. Switch profiles → each keeps its own open tabs alive in the background.
  Open which tab is active persists across restart (per profile).
- **Phase 7:** Receiving mail in any account produces a native macOS notification
  (you may need to approve Glide in System Settings → Notifications on first run).
  Press Cmd-1 / Cmd-2 / … → switches to the 1st / 2nd / … account, even when an
  account web view has focus. Copy/paste still work inside the web views.

## Phase log
- **Fix — ✅ Screen sharing (Google Meet).** Electron rejects `getDisplayMedia`
  unless the app provides a display-media handler, so Meet's "share screen"
  failed. Added `session.setDisplayMediaRequestHandler` per account session with
  `{ useSystemPicker: true }` (native macOS 15+ picker) and a `desktopCapturer`
  fallback (primary screen). Still requires the OS **Screen Recording** permission
  for Glide (System Settings → Privacy & Security → Screen Recording) — manual,
  granted once. guard + build + smoke (×2) + isolation pass.
- **Fix — ✅ Google login popup hands session back.** OAuth sign-in opens a
  popup (`accounts.google.com`, sharing the account partition); after it closes
  the opener now reloads, so the completed login is reflected in the main view
  (previously the original view stayed logged-out). Implemented via
  `webContents.on('did-create-window')` → watch the child for an
  accounts.google.com navigation → reload the opener on the child's `closed`.
  guard + build + smoke (×2) + isolation pass.
- **Fix — ✅ External-protocol links + bookmarks overflow + test isolation.**
  - **Zoom/app links:** `zoommtg://` (and `mailto:`, Teams, `tel:`, …) now hand off
    to the native app via `shell.openExternal`. Handled in each view's
    `setWindowOpenHandler` + `will-navigate`, plus a global `web-contents-created`
    `will-navigate` hook so popup join-pages work too. (`isExternalProtocol` gates
    non-web schemes.)
  - **Bookmarks overflow:** the bookmarks bar no longer scrolls — items that don't
    fit collapse into a "»" More button that opens them as a native menu
    (`openBookmarksOverflow`). A hidden measurer row gives stable widths so the
    fitting count doesn't flip-flop.
  - **Test isolation:** tests now launch against throwaway `GLIDE_USER_DATA_DIR` +
    `GLIDE_SHARED_DIR` (see `tests/launch.ts`), so they don't collide with a running
    Glide's single-instance lock and never read/mutate real profiles/settings.
  - guard + build + smoke (×2) + isolation pass (with the real app running).
- **Polish — ✅ Memory savings (lazy windows + idle discard).** Two levers, no hit
  to the active workflow: (1) the **first window stays eager** (loads all profiles
  → full unread badges + instant switching) while **additional windows are lazy**
  (load a profile only on first switch) — fixes the multi-window memory doubling;
  (2) **idle background views auto-discard** after 30 min unused (5-min sweep,
  timer `unref`'d) and rebuild on next activation from the tab's `currentUrl`. Tabs
  gained an optional `view` (undefined = discarded) + `lastActive`; the visible tab
  is never discarded and its timestamp is refreshed each sweep. Title/favicon/unread
  persist on the tab record across discard, so badges/tab labels survive. guard +
  build + smoke (×2) + isolation pass.
- **Phase 12 — ✅ Multiple windows (Cmd-N).** Refactored `AccountManager` from
  single-window to multi-window: account **metadata + app settings are shared**
  (one source of truth, single persistence writer), while **tabs / active profile
  / unread are per-window**, keyed by `BrowserWindow.id`. Each window builds its
  own WebContentsViews; metadata mutations (add/edit/remove account, shortcuts,
  bookmarks, avatar, zoom/layout/bookmarks-bar) **broadcast to all windows**. IPC
  now resolves the sending window via `BrowserWindow.fromWebContents`. New Window
  = **Cmd-N** (File menu) or a second app launch (single-instance `second-instance`
  → new window). Each window opens to the default active profile and shares all
  logins/sessions. New automated test (`opens a second independent window`) joins
  the smoke suite. guard + build + smoke (×2) + isolation pass. Notes: each window
  eagerly loads all profiles' initial tabs (more memory per window — expected); new
  windows open to the saved default profile.
- **Fix — ✅ Single-instance lock (crash fix).** Glide had no single-instance
  guard, so launching it more than once (or relaunching while a stale/hung
  instance lived) ran multiple processes that all opened the same per-user
  session partitions and fought over Chromium's LevelDB locks — corrupting data
  and crashing (observed: repeated "Failed to open LevelDB … LOCK" + "quota
  database resetting" in the diagnostic log). Added `app.requestSingleInstanceLock()`:
  a second launch quits and focuses the existing window instead. This is also the
  correct foundation for multi-window (one process, many windows). guard + build +
  smoke + isolation pass.
- **Polish — ✅ Machine-shared settings (cross macOS user).** Moved the config
  JSON from per-user `userData` to `/Users/Shared/Glide/glide-state.json` (dir
  `0777`, file `0666`) so every macOS user account on this Mac loads the same
  profiles/apps/bookmarks/layout/zoom. Migrates the legacy per-user file in once
  on first run. **Settings only** — Google sessions/logins stay private per macOS
  user in each user's own `userData` (not shared), by design. guard + build +
  smoke + isolation pass. Verified the shared file is created world-writable with
  the real config migrated.
- **Polish — ✅ Passwords app (passwords.google.com).** Added to the default app
  set for new profiles, plus a one-time migration (`seedPasswordsApp`, guarded by
  persisted `seededPasswordsApp`) that adds it to existing profiles that lack it —
  so it won't reappear if later removed. (Context: Apple Passwords can't autofill
  in Glide — Apple gates the iCloud Passwords native-messaging host to a
  code-signature whitelist of approved browsers; Google Password Manager is the
  practical in-app path.) guard + build + smoke + isolation pass.
- **Polish — ✅ Drag-to-reorder apps.** App-rail items are now draggable (live
  preview during drag, commit on drop) via a `reorderShortcuts` IPC that reorders
  `account.shortcuts`, persists, and re-emits apps/shortcuts state. Works in both
  the left-rail and top-row layouts. guard + build + smoke + isolation pass.
- **Phase 14 — ✅ Bookmarks bar + Chrome import (per profile).** Added a
  per-profile bookmark tree (`BookmarkNode` = link | folder, persisted on the
  account) and a **toggleable bookmarks bar** (View/Bookmarks → Show Bookmarks
  Bar, Cmd-Shift-B; app-wide visibility persisted, reserves `BOOKMARKS_BAR_HEIGHT`
  so the content offset is now dynamic). Top-level links open in a tab; folders
  open a **native popup menu** (nested submenus, floats above the web view).
  **Import from Chrome:** `chromeBookmarks.ts` reads a chosen Chrome profile's
  plaintext `Bookmarks` JSON (`roots.bookmark_bar`), converts the tree, and
  replaces the active Glide profile's bookmarks; a picker modal
  (`ChromeImportDialog`) lists detected Chrome profiles by name + count. New IPC
  (bookmarks:list/open/open-folder/bar-visible/chrome-profiles/import +
  bookmarks:state/visible + menu:import-bookmarks). Verified the parser against a
  real 194-bookmark Chrome profile. guard + build + smoke + isolation pass.
- **Polish — ✅ Apps no longer duplicate into the tab strip.** App tabs (those
  with an `originShortcutId`) are now filtered out of `getTabs`, so clicking an
  app just switches to it via the app rail instead of also creating a tab-strip
  entry. The tab strip is reserved for ad-hoc pages (+ / links). Added a **Close**
  item to an app's right-click menu (enabled when its tab is open) to unload it.
  guard + build + smoke + isolation pass.
- **Polish — ✅ App-rail layout switch.** New persisted `layout` setting
  (`'left' | 'top'`) toggled from **View → App Layout** (radio; menu rebuilds to
  keep the check in sync). `'left'` = the vertical rail (current); `'top'` = a
  compact favicon+badge icon row pinned to the right of the title bar. Main
  computes content-left offset from the layout (`contentLeft()`); renderer mounts
  `AppRail` in the title bar or as the left column via a `variant` prop. New IPC
  (`layout:get` + `layout:changed`). guard + build + smoke + isolation pass.
- **Polish — ✅ Omnibox search.** The address bar now resolves entries like a
  browser: explicit schemes and domain-like input (host.tld, paths, localhost,
  IPv4) navigate directly; anything with spaces or no dot becomes a Google search
  (`google.com/search?q=…`). Implemented as `resolveQuery()` used by `navigate()`.
  guard + build + smoke + isolation pass.
- **Polish — ✅ Drag-to-reorder tabs.** Tabs in the strip are now `draggable`;
  dragging shows a live preview (local order state) and commits on drop via
  `reorderTabs` IPC, which reorders `account.tabs` in main and re-emits tab
  state. Session-only (tabs aren't persisted). guard + build + smoke + isolation
  pass. (Chrome extension support logged as a future feature — see above.)
- **Phase 13 — ✅ App rail + favicons + per-app badges.** Added a vertical **app
  rail** (`AppRail.tsx`, `APP_RAIL_WIDTH`) between the profile avatars and the page,
  replacing the horizontal bookmarks bar; content now starts at SIDEBAR_WIDTH +
  APP_RAIL_WIDTH. Each app shows its **favicon** (captured via `page-favicon-updated`,
  cached on the shortcut + persisted), a label, and a **per-app unread badge**
  (unread is now tracked per app: `unreadByApp`, parsed from each app tab's title;
  the profile avatar badge shows the per-account total). Tabs in the strip also show
  favicons. New IPC (`apps:list` + `apps:state` push), `Shortcut.favicon`,
  `TabInfo.favicon/shortcutId`, `AppInfo`/`AppsState`. CSP `img-src` broadened to
  `https:` so favicons load. guard + build + smoke + isolation pass.
- **Polish — ✅ Page zoom.** Cmd +/-/0 (via the View menu, so they fire even when
  a page has focus) zoom the active content. Zoom is app-wide (applied to every
  open tab and reapplied on each tab's load), clamped 30%–300%, and persisted
  (`PersistedState.zoomFactor`). guard + build + smoke + isolation pass.
- **Phase 11 — ✅ General browser tabs.** Decoupled tabs from shortcuts: tabs are
  now id-based (`Tab` has its own id + title + optional `originShortcutId`), held
  in an ordered list per account. Added a real **tab strip in the title bar**
  (`TabStrip.tsx`) with per-tab titles, × close, and a + new-tab button (opens
  google.com). The shortcuts bar reverted to a **bookmarks bar** — clicking a
  bookmark focuses its tab if open, else opens a new one. New IPC
  (`tabs:new/activate/close/open-shortcut/list` + `tabs:state` now carries
  `TabInfo[]`). Title bar reserves space for the traffic lights and stays
  draggable in its empty area. guard + build + smoke + isolation pass.
  **Next: Phase 12 makes tabs per-window so multiple windows can each have their
  own tabs (shared profiles/sessions).**
- **Phase 10 — ✅ Shortcuts became persistent tabs.** Reworked `AccountManager`
  from one view per account to a per-account **tab model**: each shortcut can open
  its own live `WebContentsView` (all tabs share the account's session partition,
  so every service stays logged into the same account). Tabs are **lazy** (created
  on first click), **stay loaded** (clicking Mail↔Calendar no longer reloads), and
  are **closeable** (× on the pill, or right-click → Close tab) to reclaim memory.
  The shortcuts bar is now a tab strip (open/active states). New IPC
  (`tabs:open/close/list` + `tabs:state` push), `NavState.tabId`, persisted
  `activeShortcutId`. Nav/unread/avatar/overlay all operate on the active tab.
  Isolation still holds (per-account partition, shared by that account's tabs).
  guard + build + smoke + isolation pass.
- **Polish — ✅ Dedicated title bar (Shift-style layout).** Reworked the chrome
  into three stacked strips: a 30px draggable black **title bar** at the very top
  (traffic lights on its left, shows the active page/account title centered), then
  the nav/address **toolbar** (no longer draggable — address bar is out of the
  title area), then the shortcuts bar. `.app` is now a column with a `.body` row
  holding the sidebar + main column. Account view offset = TITLE_BAR + TOP_BAR +
  SHORTCUTS_BAR. guard + build + smoke + isolation pass.
- **Polish — ✅ Black title bar + Google profile photos.**
  - Title bar: `titleBarStyle: 'hiddenInset'` + `trafficLightPosition`, near-black
    window bg, sidebar/top-bar made draggable (`-webkit-app-region`) with controls
    opting out, sidebar top padded to clear the traffic lights.
  - Avatars: main runs a read-only snippet (`AVATAR_SCRIPT`) in each logged-in
    Google page on `did-finish-load` to grab the account photo URL, stores it per
    account, persists it (`avatarUrl`), and includes it in `AccountSummary`; the
    sidebar shows the photo when present, else the colored letter. CSP relaxed to
    allow `img-src https://*.googleusercontent.com`. **Best-effort**: only appears
    once logged in and depends on Google's DOM (selectors may need updating). guard
    + build + smoke + isolation pass.
- **Fix — ✅ Overlay layering.** A native `WebContentsView` always paints above
  the HTML UI, so DOM context menus/modals appeared *behind* the Gmail pane.
  Fixed structurally: (1) right-click menus for accounts and shortcuts are now
  native Electron `Menu.popup()` menus (float above the web view; "Edit" routes
  back to the renderer, "Remove" runs in main); (2) while any modal dialog is
  open the renderer calls `setOverlay(true)`, which hides the active web view so
  the dialog is fully visible, restored on close. Removed the DOM context-menu
  code. guard + build + smoke + isolation pass.
- **Phase 9 — ✅ Per-profile shortcuts bar.** A second chrome strip
  (`ShortcutsBar.tsx`, 40px, `SHORTCUTS_BAR_HEIGHT`) under the address bar shows
  the ACTIVE profile's shortcuts as pills; clicking one navigates that profile's
  view (stays in its isolated session). Each profile has its own editable list,
  seeded with the common Google apps (Mail/Calendar/Drive/Docs/Sheets/Meet/
  Contacts) and persisted per account (`PersistedAccount.shortcuts`); existing
  accounts auto-migrate to the defaults on next launch. `[+]` adds, right-click a
  pill → Edit/Remove (`ShortcutDialog.tsx`). New IPC (`shortcuts:list/add/update/
  remove` + `shortcuts:updated` push), preload methods, and shared types. Account
  view bounds now reserve both chrome strips (TOP_BAR + SHORTCUTS_BAR). guard +
  build + smoke + isolation pass. Real multi-tab browsing remains deferred (user
  chose "shortcuts now, tabs later").
- **Packaging (Phase 8, user-approved) — ✅** Added electron-builder with a local,
  unsigned macOS build (`npm run package` → `dist/mac-arm64/Glide.app`). Needed
  because passkey-over-Bluetooth (caBLE) sign-in fails when the app is launched
  from a terminal — macOS only allows Bluetooth/FIDO for a "self-responsible"
  process, i.e. an app launched from Finder. Bundle id `com.bcamp.glide`, ad-hoc
  signed (`identity: null`), with `NSBluetoothAlwaysUsageDescription` +
  camera/mic usage strings in Info.plist. Build verified. True distribution
  (Developer-ID signing, notarization, DMG, auto-update) remains out of scope.
- **Phase 7 — ✅ (1 sub-item deferred)** Per-account session permission handlers
  grant notifications (+ media for Meet, clipboard, fullscreen, pointer lock) and
  deny the rest, so Google notifications surface as native macOS notifications. An
  application menu (`menu.ts`) adds Cmd-1 … Cmd-9 accelerators → `setActiveByIndex`
  to switch accounts, alongside standard appMenu/editMenu/windowMenu roles (so
  copy/paste still work in the web views). Background-activity indication is
  provided by the Phase 6 unread badges. Notification click-to-switch is
  intentionally deferred (no-preload constraint — see "Deferred" note above).
  guard + build + smoke + isolation pass. Notification delivery + Cmd-N switching
  are manual checks (GUI).
- **Phase 6 — ✅** Unread badges: `AccountManager` watches every view's
  `page-title-updated` (incl. background accounts), parses a leading `(\d+)` from
  the title (`parseUnread`), stores per-account counts, and pushes
  `accounts:unread` {id,count} to the renderer (+ `accounts:unread-all` for the
  initial fetch). Sidebar renders a numeric badge (99+ cap) on each avatar,
  cleared at zero. Colored avatars + active highlight were already in place from
  Phase 2. guard + build + smoke + isolation pass. Live badge updates are a manual
  check (needs real Gmail).
- **Phase 5 — ✅** Added browser chrome: a 44px top bar (`TopBar.tsx`) with
  back/forward/reload + an editable address field, all acting on the active
  account's webContents via IPC (`nav:back/forward/reload/go/state`). Main pushes
  `nav:state` (url, canGoBack/Forward, title) on navigation, title change, and
  active switch; uses the modern `webContents.navigationHistory` API. Account view
  bounds now reserve the top strip (`TOP_BAR_HEIGHT`, kept in sync with the
  `.topbar` CSS). `navigate()` prefixes `https://` via `normalizeUrl`. Popups stay
  in-partition via `setWindowOpenHandler` with an overridden partition. guard +
  build + smoke + isolation pass. In-pane navigation is a manual check (GUI).
- **Phase 4 — ✅** Account set is now editable from the UI. Sidebar `[+]` opens an
  Add dialog (label, color, home URL); right-click an avatar → Edit (label/color)
  or Remove. Main gained `addAccount` (uuid + new partition + view, made active),
  `updateAccount`, and `removeAccount` (destroys the view AND calls
  `clearStorageData()` on its partition so the account is truly gone), plus an
  `accounts:updated` push so the sidebar re-renders. New IPC + preload methods +
  shared types. guard + build + smoke + isolation pass. Add/edit/remove behavior
  is a manual check (GUI). (Note: respected the §2.2 non-goal of "no tests beyond
  §6" — no new test file added.)
- **Phase 3 — ✅** Added `src/main/persistence.ts` (load/save `PersistedState`
  JSON in userData, defaults on missing/corrupt). `AccountManager` now tracks each
  account's current URL (did-navigate / in-page) and exposes `snapshotAccounts()`.
  Main restores window bounds + accounts + active + per-account `lastUrl` on launch
  and saves debounced on navigation/active-change/resize/move, plus on before-quit.
  Set `app.setName('Glide')` so data lives in `Application Support/Glide/`. Verified
  the state file is written with accounts, lastUrl, activeAccountId, and window
  geometry. guard + build + smoke + isolation pass. Restart-restore is a manual
  check (needs a GUI session).
- **Phase 2 — ✅** Multiple isolated accounts (3 hardcoded seeds), each its own
  `persist:account-<id>` WebContentsView. Sidebar renders avatars; clicking
  switches the active view via IPC (`accounts:switch` / `accounts:active-changed`),
  active item highlighted. Added shared types, typed `window.glide` bridge, and
  `tests/isolation.spec.ts` (+ `test:isolation`) proving cookies don't bleed
  across partitions. guard + build + smoke + isolation all pass. (Fix during the
  phase: the isolation test had named its Playwright Page `window`, shadowing the
  browser global inside `evaluate`; renamed to `page`.)
- **Phase 1 — ✅** Added `AccountManager` (src/main/accounts.ts) owning a
  `WebContentsView` on partition `persist:account-default`, loading Gmail,
  positioned right of the 64px sidebar and re-laid-out on window resize. Account
  views use no preload, no node integration, context isolation on. guard + build
  + test:smoke pass. Manual login-persistence check pending (see above).
- **Phase 0 — ✅** Scaffolded electron-vite + React + TypeScript. Window opens at
  1280×800 titled "Glide" with the sidebar shell. `npm run guard`, `npm run build`,
  and `npm run test:smoke` all pass. Security defaults set (contextIsolation on,
  nodeIntegration off, preload via contextBridge).
