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
| — | Real multi-tab browsing | ⬜ (deferred — user chose "tabs later") |

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
- **Phase 9:** With a profile active, the shortcuts row shows Mail/Calendar/Drive/
  etc.; click one → that profile navigates there (still logged into that account).
  Switch profiles → the row swaps to that profile's shortcuts. `[+]` adds a
  shortcut (e.g. a specific Drive folder URL); right-click → Edit/Remove. Changes
  persist across restart and are independent per profile.
- **Phase 7:** Receiving mail in any account produces a native macOS notification
  (you may need to approve Glide in System Settings → Notifications on first run).
  Press Cmd-1 / Cmd-2 / … → switches to the 1st / 2nd / … account, even when an
  account web view has focus. Copy/paste still work inside the web views.

## Phase log
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
