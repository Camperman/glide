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
| 14 | Download handling (save to ~/Downloads, top-bar panel) | ✅ |
| 15 | Per-account notification mute | ✅ |
| 16 | Notification click → switch to account | ✅ |
| 17 | Chrome extensions (Electron 37, electron-chrome-extensions) | ✅ |
| 18 | Friends-tier distribution (signing/notarization/DMG/GPL) | ✅ |
| 19 | Default-browser registration + open-url (passkey-entitlement prereq) | ✅ |
| 20 | Preferences window (themes, color profiles, extensions, downloads) | ✅ |
| 21 | Browser basics (find-in-page, tab shortcuts, spell-check, print) | ✅ |
| 22 | History + omnibox autocomplete | ✅ |
| 23 | Auto-update (electron-updater + GitHub Releases) | ✅ |
| 24 | Polish: tab audio indicators + hover link readout | ✅ |
| 25 | Tab restore, Cmd-D bookmarks, dock badge, richer context menu | ✅ |
| 26 | Incognito sessions (Cmd-Shift-N, memory-only partition) | ✅ |
| 27 | Crash auto-recovery + history page (Cmd-Y) | ✅ |
| 28 | First-run onboarding (welcome flow, single starter account) | ✅ |
| 29 | Omnibox live search suggestions | ✅ |
| 30 | Command palette (Cmd-K quick switcher) | ✅ |

## Next up
**First complete cut (Phases 0–7) is done.** Remaining polish explicitly requested
2026-07-08: per-account notification mute (Phase 15), notification click-to-switch
(Phase 16), Chrome extensions (Phase 17). Already shipped earlier without a phase
entry: auto-fetched Google avatars, persisted global zoom. **Scroll-position
restore was investigated and dropped**: views stay alive while the app runs (scroll
only lost on the 30-min idle discard), and Google apps scroll inner containers, so
a generic window-scroll restore wouldn't actually restore anything useful.

### Phase 15 notes — per-account notification mute (2026-07-08)
Right-click an account in the sidebar → **Mute Notifications** (checkbox).
Muting flips a persisted `muted` flag; the session's permission request/check
handlers consult it live, so Chromium denies the notification permission the
next time the page checks — no reload needed. A small 🔕 badge shows on the
muted account's avatar (bottom-right, mirroring the unread badge). Unread
badges still work while muted (they come from the page title, not
notifications). Manual check: mute an account, send it a mail from elsewhere —
no banner appears, unread badge still increments; unmute → banners return.

### Phase 14 notes — downloads (2026-07-08)
Chrome-style: every download saves straight to `~/Downloads` (name uniquified,
no save dialog) via a per-partition `will-download` hook (`src/main/downloads.ts`).
A ↓ button appears at the right of the top bar once a download exists this session
(progress ring while active; dock icon shows aggregate progress; dock bounces on
completion). Click → panel with per-item progress, Open, Show in Finder, Cancel,
Clear. The panel uses the modal-overlay mechanism (web view hidden while open), so
it is **not auto-opened** on download start — that would blank the page mid-browse.
Manual check: download an attachment from Gmail; verify file lands in ~/Downloads,
ring/panel show progress, Show in Finder works.

### Known limitation — sign-in
**Passkey-over-Bluetooth ("hybrid"/caBLE) is not supported.** It depends on
full Apple Developer-ID signing + notarization + hardened runtime, which a
locally-built, ad-hoc-signed app doesn't have (granting the Bluetooth TCC
permission is necessary but not sufficient). **Sign in with a non-Bluetooth
method instead** — on Google's "Something went wrong / Make sure Bluetooth is
on" screen, click **Try another way** → "Tap Yes on your phone" (internet-based,
not BLE) / authenticator code / password / backup code. Sessions persist, so
this is one-time per account. Revisit only if we ever add Developer-ID signing.

### Phase 29–30 notes — live suggestions + command palette (2026-07-08)
- **Live search suggestions**: OpenSearch endpoints per engine (Google
  `suggestqueries`, DDG `ac`, Bing `osjson`), 800 ms budget, best-effort;
  merged after history/bookmarks, six rows max, escape hatch always last;
  per-window token discards stale keystrokes. Verified live against Google.
- **Cmd-K Quick Switcher**: fuzzy jump to any account, any account's app
  ("Personal › Mail"), or an active-account tab; arrows/Enter/Esc/click;
  incognito sessions excluded. Verified end-to-end (filter → Enter →
  account switched).

### Phase 28 notes — first-run onboarding (2026-07-08)
Fresh installs now seed ONE starter account ("Personal") instead of three
placeholders, plus a `firstRun` flag (captured at startup — buildState would
otherwise drop it on the first debounced persist). The welcome dialog names
the account, picks a color, and points at the sidebar + and Cmd-,. Verified
by automated test: rename applies, flag clears, no welcome on relaunch.
Existing installs are untouched (their state file already exists). The
isolation test now adds its second account through the real addAccount API.

### Phase 26–27 notes — incognito, crash recovery, history page (2026-07-08)
- **Incognito (Cmd-Shift-N)**: ephemeral account on a memory-only partition
  (no `persist:` prefix). Full chrome reuse; no history recording, no
  extensions, never persisted (verified by automated relaunch test); dashed
  🕶 avatar; remove via right-click or quit.
- **Crash recovery**: `render-process-gone` (except clean-exit/killed) →
  auto-reload, max twice per minute per tab to avoid crash loops.
- **History page (Cmd-Y)**: per-account browser with search, relative times,
  click-to-open, and Clear History.

### Phase 25 notes — daily-driver gaps (2026-07-08)
- **Tab restore**: the primary window's open tabs (per account, incl. which
  was active) persist and restore on launch — only the active tab gets a live
  view; the rest materialize on first activation (same memory model as idle
  discard). Gotcha fixed via test: windows unregister before the quit-time
  persist, so tabs are stashed on the account metas at unregister.
- **Cmd-D** bookmarks the current page to the bar (deduped by URL);
  right-click a bookmark → Edit (dialog) / Remove. Works on imported trees.
- **Dock badge**: total unread across accounts via app.setBadgeCount.
- **Context menu**: images get Open in New Tab / Save (flows through the
  downloads panel) / Copy; selected text gets "Search for …" honoring the
  search-engine preference.

### Phase 24 notes — audio indicators + link readout (2026-07-08)
- Tabs show 🔊 while audible (click to mute → 🔇; mute survives idle-discard
  rebuilds). App-rail icons get a small 🔊 when one of their tabs plays.
- Hovering a link shows its URL right-aligned in the top bar
  (`update-target-url`) — bottom-left Chrome placement is impossible since
  DOM can't paint over the account views.
Manual check: play a YouTube/Meet tab → speaker appears; mute silences it.

### Phase 23 notes — auto-update (2026-07-08)
`electron-updater` against GitHub Releases (public repo — downloads need no
token). Checks 15 s after launch + every 4 h; background download; dialog
offers Restart Now / Later (Later installs on next quit). No-ops in dev and
swallows errors (expected for unsigned local builds and until a release
carries update artifacts). **Release flow changed:** `npm run dist` now also
produces a **zip + latest-mac.yml** — upload BOTH (plus the DMG) to every
GitHub release or auto-update silently never finds updates:
`gh release create vX.Y.Z dist/Glide-*.dmg dist/Glide-*.zip dist/latest-mac.yml`.
Older installs (≤0.2.0) predate the updater — friends on those re-download once.

### Phase 22 notes — history + omnibox autocomplete (2026-07-08)
- **History** (`src/main/history.ts`): per-account, recorded on main-frame
  navigations + title updates; frecency-ranked queries; capped 3000/account;
  stored in **per-user** userData (`glide-history.json`) — history is
  personal, never the shared config. Cleared when an account is removed.
- **Omnibox suggestions**: DOM cannot paint above account WebContentsViews,
  so the dropdown is its own small trusted WebContentsView
  (`src/main/omnibox.ts` + `suggestions.html` + dedicated preload), floated
  under the address field (renderer measures the input rect and sends it).
  Rows: history (frecency) → bookmarks → always a "Search <engine> for …"
  escape hatch. Arrow keys cycle (main owns selection; fill text returns to
  the input so plain Enter navigates), mousedown-click navigates (mousedown
  beats the input's delayed blur→hide), Esc/submit/resize/account-switch hide.
Manual check: browse a bit, then type a host prefix — history rows should
lead; arrow down + Enter should navigate.

### Phase 21 notes — browser basics (2026-07-08)
- **Find in page (Cmd-F)**: find bar occupies a chrome row (main shrinks the
  web view via `FIND_BAR_HEIGHT` in `topChrome`) so the page stays visible —
  no overlay. Live "n / m" counter from `found-in-page`; Enter/Shift-Enter
  cycle; Esc closes; dismissed automatically on account switch.
- **Tab shortcuts**: Cmd-T new tab, **Cmd-W now closes the tab** (window is
  Cmd-Shift-W; closing an account's last tab no-ops — accounts are
  workspaces), Cmd-Shift-T reopens (25-deep per-window stack), Ctrl-Tab /
  Cmd-Shift-]/[ cycle, Cmd-L focuses the address bar, Cmd-P prints.
- **Spell-check**: right-click a squiggled word → suggestions + Add to
  Dictionary (params.dictionarySuggestions were previously ignored).
Manual checks: Cmd-F in Gmail shows live match counts; Cmd-W muscle memory.

### Phase 20 notes — Preferences (2026-07-08)
Preferences window (⚙ at sidebar bottom, or Glide → Preferences… / Cmd-,),
three sections:
- **General** — Appearance **System/Light/Dark** (`nativeTheme.themeSource`;
  main resolves and pushes `PrefsState { prefs, dark }` so renderers never
  guess), six **color profiles** (Graphite default, Midnight, Forest, Ember,
  Orchid, Ocean — each with full dark AND light palettes; registry in
  `src/shared/themes.ts`, palettes as `[data-profile][data-theme]` CSS-var
  blocks), launch at login, default-browser status/button, new-tab URL,
  search engine (Google/DuckDuckGo/Bing).
- **Extensions** — per-account list + **Uninstall** + "Open Chrome Web Store".
- **Downloads** — folder picker + "ask where to save each file".
The whole chrome was converted to semantic CSS vars (--border/--surface/
--hover*/--modal-bg/…); window backgroundColor tracks the theme. Verified
visually via scripted screenshots across profiles (Playwright pins
prefers-color-scheme, which is why main pushes resolved dark — do not revert
to renderer matchMedia). Note: appearance also flips `prefers-color-scheme`
for Google pages (they follow it when their theme is "device default").
Manual check: flip appearance + profiles in the packaged app; toggle launch
at login; uninstall an extension; change the downloads folder.

### Phase 19 notes — default-browser support (2026-07-08)
Prerequisite for the `com.apple.developer.web-browser.public-key-credential`
entitlement request (Apple's published criteria require the app to declare
http/https in Info.plist and behave as a browser):
- `CFBundleURLTypes` (http/https, Viewer) + `CFBundleDocumentTypes` (HTML) via
  electron-builder `extendInfo`.
- `app.on('open-url')` opens the link as a foreground tab in the focused
  window's active account; URLs arriving during launch are queued and flushed
  after the first window registers. http/https only.
- **File → Set as Default Browser…** calls `setAsDefaultProtocolClient`
  (macOS shows its own confirmation dialog).
Before filing the entitlement request: confirm who holds the **Account
Holder** role on Gotta Play Games LLC (Apple requires the request come from
the Account Holder; Brandon shows as Admin in Xcode). Manual check: set the
packaged Glide as default browser, click a link in another app → opens as a
tab in the active account.

### Phase 18 notes — friends-tier distribution (2026-07-08, in progress)
Scope approved as a REQUIREMENTS §2.2 exception. Code/config complete:
- **Per-user settings by default.** `/Users/Shared/Glide` world-writable mode is
  now opt-in (used only when the shared file already exists — i.e. Brandon's
  Mac — or `GLIDE_SHARED_DIR` is set). Fresh installs get plain `userData`.
- **`npm run dist`** → signed, notarized, hardened-runtime **DMG** (arm64).
  `npm run package` unchanged: fast local unsigned `--dir` build.
- Entitlements: `build/entitlements.mac.plist` (JIT, mic/camera for Meet,
  Bluetooth for future passkeys). Notarization reads `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars.
- **GPL-3.0**: LICENSE + package.json license field + README (public repo
  satisfies the electron-chrome-extensions GPL obligation).

**Completed 2026-07-08:**
- Public repo: **https://github.com/Camperman/glide** (GPL-3.0).
- Developer ID Application cert created (Gotta Play Games LLC / VZ44XQWQ84);
  notarization credentials in keychain profile `glide`
  (`APPLE_KEYCHAIN_PROFILE=glide` is set by `npm run dist`).
- v0.1.0 DMG built: app signed (hardened runtime) + notarized + stapled;
  Gatekeeper `accepted (Notarized Developer ID)`. DMG container additionally
  signed + notarized + stapled; `dmg.sign` enabled for future builds.

**Remaining manual check:** first run of the DMG on a Mac (or macOS account)
without the shared config — app opens with no Gatekeeper friction and creates
per-user settings.

### Phase 17 notes — Chrome extensions (2026-07-08)
Built the "Tier 2" path scoped below. **Electron 34 → 37.10.3** (the version
electron-browser-shell tests against; ≥35 needed for MV3 service workers), plus
`electron-chrome-extensions@4.9` (GPL-3.0 — fine, Glide is personal/undistributed)
and `electron-chrome-web-store@0.13`. Architecture:
- One `ElectronChromeExtensions` instance **per account partition**
  (`src/main/extensions.ts`) — extensions install per profile, like Chrome.
- Installs: browse `chromewebstore.google.com` inside any Glide tab of that
  account and click "Add to Chrome". Installed extensions persist under
  `userData/Extensions/<accountId>` and auto-update.
- Toolbar: `<browser-action-list partition=…>` in the top bar (element injected
  by our UI preload via `injectBrowserAction()`); popups are positioned by the
  library. `ExtensionManager.handleCRXProtocol` serves icons.
- Tab model bridged via `ExtensionTabDelegate` on AccountManager
  (chrome.tabs create/select/remove → our openTab/activate/closeTab).
- electron-vite now uses `externalizeDepsPlugin` — the library must load its
  companion session preload from its real node_modules path (verified present
  in the packaged app.asar).

**Conscious tradeoff (documented like Phase 16's):** the library registers its
own sandboxed `chrome-extension-api` preload on account sessions — that is how
chrome.* APIs reach content scripts. Glide itself still attaches no preload to
account views and they keep `nodeIntegration: false, contextIsolation: true`.

**Caveats:** not every extension works (deep `webRequest`/native-messaging ones
may be partial); maintenance now tied to the library tracking Chromium. Manual
checks: (1) in an account tab visit the Web Store, install **uBlock Origin
Lite**; icon appears in the top bar; ads blocked in that account only.
(2) Install **1Password** — expect partial: popup UI should render; native-app
integration (biometric unlock) won't work without native messaging.

### Phase 16 notes — notification click-to-switch (2026-07-08, resolves the Phase 7 deferral)
Originally deferred because it seemed to need a preload on account views
(forbidden by REQUIREMENTS.md §4.1/§7). Solved **without a preload**: a small
script injected via `executeJavaScript` on `did-finish-load` (the same precedent
as the avatar scrape) wraps `window.Notification` and `console.log`s a sentinel
when a notification is clicked; main hears it on the tab's `console-message`
event and switches window/account/tab and focuses the app. The channel is
one-way page→main with no exposed privileges — account views still have no
preload and no node integration. Caveat: notifications fired from **service
workers** bypass `window.Notification` and aren't caught (Gmail/Calendar/Meet
fire from the page today). Manual check: with account B in the background,
receive a mail there, click the banner → Glide focuses and switches to B.

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
- **Polish — ✅ Rounded content card (Electron 34).** Upgraded Electron 33 → 34
  for `WebContentsView.setBorderRadius`. Each tab view now has rounded corners
  (`CONTENT_RADIUS`) and is inset by `CONTENT_INSET` (8px) so the dark-gray chrome
  forms a gutter/card around the page — the Shift "floating rounded content" look.
  guard + build + smoke (×2) + isolation pass on Electron 34.5.x. (Note: new
  Electron major; verified via gates, not GUI.)
- **Polish — ✅ Unified dark-gray chrome + profile photos fill circle.** Profile
  avatars now fill the circle (neutral fallback bg only behind the letter) with a
  color **ring on the active** profile (the old fill color). Title bar + toolbar
  recolored from black to the **dark-gray panel color**, so all chrome (sidebar,
  app rail, bookmarks, title bar, toolbar) is one surface; active tab bumped to a
  lighter shade so it still reads as selected. URL bar capped (`max-width: 680px`)
  so chrome shows around it. Window bg → dark gray. guard + build + smoke (×2) +
  isolation pass. **Still pending (needs Electron 34): rounded corners on the
  native render window** — `WebContentsView.setBorderRadius` landed in Electron 34
  and we're on 33.
- **Polish — ✅ Shift-style chrome tweaks.** Profile avatars (and the add-profile
  button) are now **circles** (`border-radius: 50%`); softer **rounded corners**
  across tabs, app rail, modal, buttons, app icons; **folder icon** (inline SVG)
  next to bookmark folders; and the **active app reads like a selected tab** —
  a filled, rounded "wrap" around the icon + label. guard + build + smoke (×2) +
  isolation pass. (Pure renderer CSS/markup.)
- **Polish — ✅ Links open as tabs (with right-click → new window).** The window-
  open handler now routes by disposition: `foreground-tab`/`background-tab` (link /
  target=_blank opens) become **new tabs** in the current profile; only real
  popups (`window.open` with size features → `new-window`, e.g. OAuth) still get
  their own window — so login isn't broken. Added a web-view **right-click menu**
  (Electron has none by default): on a link → Open in New Tab / Open in New Window
  / Copy Link; plus cut/copy/paste when editable and Back/Reload otherwise. New
  window = a bare window in the same profile partition. guard + build + smoke (×2)
  + isolation pass.
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
