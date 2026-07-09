# Glide — Requirements & Build Plan

> **Note (2026-07-08):** the app has been renamed **Flit** (name collision with two
> existing "Glide" browsers). This document predates the rename and keeps the
> original name; PROGRESS.md tracks the rename as Phase 34.

A personal, single-window desktop app for running multiple Google accounts side by side
with true session isolation, switching between them from a left sidebar. A scoped-down,
self-hosted clone of [Shift Browser](https://shift.com)'s core feature.

> **Status:** specification for autonomous development. This document is the source of
> truth. It is written to be built incrementally by Claude Code running in a loop — each
> phase is independently shippable and has machine-verifiable acceptance criteria.

---

## 1. Context & Goals

### 1.1 What this is
A macOS desktop app (Electron) where the author can be logged into **multiple Google
accounts simultaneously**, each in its own isolated browser container, and switch between
them instantly via a left sidebar — like Slack's workspace switcher, but each item is a
full, isolated Google session.

### 1.2 Why
Chrome logs you out of account A when you sign into account B in the same profile.
Managing 4 Google accounts means juggling Chrome profiles in separate windows. This app
puts all of them in **one window** with **one click** to switch, and keeps every account
permanently logged in via isolated, persistent sessions.

### 1.3 Primary user
A single person (the author). **Not distributed.** No multi-user concerns, no app store,
no auto-update, no code signing required (beyond what macOS Gatekeeper needs to run a
locally-built app). Runs only on the author's Mac.

### 1.4 The core insight (the entire technical foundation)
Electron is Chromium. Electron `Session` objects can be **partitioned**: every web view
assigned a `persist:<name>` partition gets its own isolated cookie jar, localStorage,
cache, and login state that survives restarts. **One partition per account = one fully
isolated, permanently-logged-in Google session.** No bleed between accounts. This is
exactly how Shift does it.

---

## 2. Scope

### 2.1 In scope (first complete cut = Phases 0–7)
- Single window: left sidebar + main content area.
- N configurable Google accounts (add / remove / edit), each fully isolated and persistent.
- Each account is a **full browser** within its container: address bar, back / forward /
  reload, and the ability to navigate anywhere (Gmail, Calendar, Drive, Docs, any URL)
  while staying inside that account's session.
- Click a sidebar item to switch the active account instantly.
- Per-account visual identity: user-assigned color + label + auto-generated avatar (initial).
- Per-account **unread badge** (parsed from the account's page title, e.g. Gmail's
  "Inbox (12)").
- Native desktop **notifications** forwarded from each account, attributable to the account.
- Persistence: account list, per-account last-visited URL, and window size/position
  survive restarts. Sessions persist (no re-login).
- Keyboard shortcuts to jump between accounts (Cmd-1 … Cmd-9).

### 2.2 Explicit non-goals (do NOT build these)
- ❌ Distribution to others, installers/DMGs, auto-update, Developer-ID code
  signing, notarization.
  - **Exception (approved 2026-06-23):** a *local, unsigned* macOS `.app` build
    via electron-builder (`npm run package`) IS in scope — it's required so the
    app is launched from Finder and is "self-responsible," which macOS demands
    for Bluetooth/FIDO passkey sign-in. Ad-hoc signed, `--dir` only, no DMG, no
    notarization, no auto-update.
  - **Exception (approved 2026-07-08): "friends-tier" distribution.** Sharing
    Glide with a few friends IS in scope: Developer-ID signing + hardened
    runtime + notarization + a DMG (`npm run dist`), per-user settings on
    machines that haven't opted into the shared-config mode, and a public
    GPL-3.0 GitHub repo (required by the electron-chrome-extensions license).
    Still out of scope: auto-update (friends re-download), Windows/Linux,
    app store, telemetry, licensing/onboarding — this is not a product.
- ❌ Windows / Linux support (macOS only; do not add cross-platform branches).
- ❌ Non-Google apps, "Spaces"/app-grouping, Slack/Outlook integrations.
- ❌ Universal cross-account search.
- ❌ Multiple tabs *within* a single account pane (single active page per account is fine
  for v1; links that open new windows should open in the same pane — see §4.6).
- ❌ Cloud sync of settings, telemetry, analytics, accounts/onboarding, licensing.
- ❌ Tests beyond the smoke/isolation checks described in §6.

If a phase tempts you to build something in this list, stop and leave it out.

---

## 3. Technology Stack (fixed — do not substitute)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | **Electron** (latest stable) | Chromium + Node. The whole point. |
| Scaffold / build | **electron-vite** | TypeScript, fast HMR, well-documented, clean main/preload/renderer split. |
| Language | **TypeScript** | Strict mode on. |
| Sidebar UI | **React** | Only the chrome (sidebar + top bar) is React. Account content is native Electron web views. |
| Web views | **`WebContentsView`** | The modern API. **Do NOT use `<webview>` tag or the deprecated `BrowserView`.** |
| Session isolation | Electron `session.fromPartition('persist:account-<id>')` | One persistent partition per account. |
| Persistence | A single JSON file in `app.getPath('userData')` | Hand-rolled or `electron-store`. Keep it simple. |
| Smoke testing | **Playwright** (`_electron` API) | For automated isolation/boot checks the loop can run headlessly. |

### 3.1 Why `WebContentsView` and not `<webview>`
`<webview>` is discouraged and buggy; `BrowserView` is deprecated. `WebContentsView`
(attached to the window's `contentView`) is the supported way to embed multiple isolated
browser views and show/hide them. The main process owns one `WebContentsView` per account
and positions the active one over the content area; the React sidebar is the window's
normal renderer.

---

## 4. Architecture

### 4.1 Process / component layout
```
┌─────────────────────────────────────────────────────────┐
│ BrowserWindow (the app window)                            │
│                                                           │
│  contentView (root)                                       │
│   ├── Renderer WebContentsView  ← React UI                │
│   │     • Left sidebar (account list, [+], active state)  │
│   │     • Top bar overlay (address + back/fwd/reload)     │
│   │       (renderer draws chrome; main lays out panes)    │
│   │                                                       │
│   └── One WebContentsView per account (Google content)    │
│         • partition: persist:account-<id>                 │
│         • only the ACTIVE account's view is visible/on top │
│         • positioned to fill the area right of the sidebar │
└─────────────────────────────────────────────────────────┘
```

- **Main process** owns the window, the account model, persistence, and the lifecycle +
  layout of every account `WebContentsView`. It is the single source of truth.
- **Renderer (React)** draws the sidebar and top browser-chrome bar. It holds no session
  state — it sends intents to main over IPC ("switch to account X", "navigate to URL",
  "add account", "go back") and renders state pushed back from main ("accounts updated",
  "active changed", "url/title/unread changed", "nav state changed").
- **Preload** exposes a typed, minimal `window.glide` IPC bridge via `contextBridge`.
  `contextIsolation: true`, `nodeIntegration: false`. The account web views get **no**
  preload and **no** node integration — they're untrusted remote Google content.

### 4.2 Account model
```ts
interface Account {
  id: string;            // uuid; also names the partition: persist:account-<id>
  label: string;         // e.g. "Work", "Personal"
  color: string;         // hex, for sidebar dot/ring + avatar bg
  homeUrl: string;       // default landing page, default https://mail.google.com
  lastUrl?: string;      // restored on launch
  order: number;         // sidebar position
}
```
Persisted file shape:
```ts
interface PersistedState {
  version: 1;
  accounts: Account[];
  activeAccountId?: string;
  window?: { width: number; height: number; x?: number; y?: number };
}
```

### 4.3 Session isolation (the critical requirement)
- Each account's `WebContentsView` MUST be created with
  `webPreferences.partition = 'persist:account-<id>'`.
- Two accounts MUST NOT share cookies or login state. This is the headline feature and is
  covered by an automated test in §6.2.
- Sessions are **persistent** (`persist:` prefix) so logins survive app restarts.

### 4.4 Layout & switching
- Sidebar is a fixed-width vertical strip on the left (~64px).
- The active account's view fills the remaining area, below the top chrome bar.
- Switching = main hides the current account view and shows the target's (z-order /
  bounds), updates `activeAccountId`, and tells the renderer to highlight the new item.
- Views are kept alive in the background (not destroyed) so switching is instant and
  background accounts keep receiving notifications / updating unread counts.

### 4.5 Browser chrome (top bar)
A slim bar above the active account view showing: back, forward, reload, and an editable
address field reflecting the active view's current URL. Actions are forwarded to the
active `WebContentsView`'s `webContents` (`goBack`, `goForward`, `reload`, `loadURL`).
Nav-state (canGoBack/canGoForward, current URL, title) is pushed to the renderer on the
relevant `webContents` events (`did-navigate`, `did-navigate-in-page`, `page-title-updated`).

### 4.6 Popups / new windows
Google opens some flows (auth, "compose in new window") via `window.open`. Handle
`webContents.setWindowOpenHandler` per account view: keep navigation **inside the same
account session** (same partition). For v1, prefer loading popups in the same view or a
transient modal child window that uses the same partition — never the default session.

### 4.7 Notifications
- Allow the Notification permission for each account session
  (`session.setPermissionRequestHandler` → allow `notifications`).
- Native notifications fired by Google web apps surface through Electron automatically.
- When a background account fires a notification, the sidebar SHOULD reflect activity
  (badge/dot). Clicking a notification SHOULD switch to that account. (Acceptable to defer
  click-to-switch to Phase 7 if it complicates earlier phases.)

### 4.8 Unread badges
Pragmatic approach: parse the account view's page title. Gmail sets the document title to
e.g. `Inbox (12) - user@gmail.com - Gmail`. On `page-title-updated`, extract the leading
`(\d+)` and push an unread count to the sidebar. No Gmail API, no OAuth. Show a numeric
badge on the sidebar item; clear when zero/absent.

---

## 5. Build Plan (phased, loop-friendly)

Each phase: a clear goal, a task list, and **acceptance criteria that are verifiable**
(by an automated check where possible, otherwise by a precise manual check). The loop
should complete a phase, verify it, commit, then move to the next. **Do not start a phase
until the previous phase's acceptance criteria pass.**

> **Definition of Done for every phase:** `npm run build` (typecheck + bundle) succeeds
> with zero TypeScript errors; the app launches via `npm start` without console errors in
> main or renderer; the phase's acceptance criteria all pass; changes committed to git
> with a message naming the phase.

### Phase 0 — Scaffold & boot
**Goal:** an Electron + electron-vite + React + TypeScript app that opens a window.
- Scaffold electron-vite (React + TS template). Strict TS.
- Main creates a `BrowserWindow` (1280×800) loading the React renderer.
- `contextIsolation: true`, `nodeIntegration: false`, preload via `contextBridge`.
- Add `npm start` (dev) and `npm run build` (typecheck + production bundle) scripts.
- Initialize git; add `.gitignore` (node_modules, out, dist).

**Acceptance:**
- `npm run build` exits 0.
- `npm start` opens a window showing a placeholder "Glide" sidebar shell. No errors in
  either console.
- Playwright smoke test (§6.1) launches the app and asserts the window title is "Glide".

### Phase 1 — One isolated account view
**Goal:** render a single Google session in a `WebContentsView` filling the content area.
- Main creates one `WebContentsView` with `partition: 'persist:account-default'`, loads
  `https://mail.google.com`, and positions it right of the sidebar.
- Resizing the window keeps the view correctly sized (handle `resize`).
- You can log into Google and use Gmail normally.

**Acceptance:**
- App shows real Gmail login/inbox in the content area.
- After logging in, **quit and relaunch** → still logged in (persistent partition works).
- View bounds track window resize (manual check).

### Phase 2 — Multiple accounts + sidebar switching + isolation proof
**Goal:** the core feature. Several isolated accounts, switch from the sidebar.
- Hardcode 2–3 accounts for now (real account UI comes in Phase 4). Each gets its own
  partition + `WebContentsView`.
- Sidebar lists them; clicking one makes its view active (shown on top), others hidden but
  alive. Active item is visually highlighted.
- IPC: renderer → main `switchAccount(id)`; main → renderer `activeChanged(id)`.

**Acceptance:**
- Clicking sidebar items switches the visible Google session instantly.
- **Isolation test (automated, §6.2):** logging into account A does not affect account B's
  session; cookies/partitions are distinct. This test MUST pass.
- Background views stay loaded (switching back is instant, no reload).

### Phase 3 — Persistence
**Goal:** accounts, active selection, last URL, and window bounds survive restarts.
- Read/write `PersistedState` JSON in `userData` on changes and on quit.
- On launch, recreate accounts from disk, restore each view's `lastUrl`, restore active
  account and window size/position.
- Persist `lastUrl` per account on navigation (debounced).

**Acceptance:**
- Configure accounts, navigate each somewhere specific, resize window, quit, relaunch →
  same accounts, same per-account pages, same active account, same window geometry.
- Delete the JSON file → app launches cleanly with sensible defaults (no crash).

### Phase 4 — Account management UI (add / remove / edit)
**Goal:** make account count configurable from the UI (your "add/remove anytime" choice).
- `[+]` button at the bottom of the sidebar opens an "Add account" dialog: label, color
  (picker), optional home URL (default Gmail).
- Adding creates a new partition + view + sidebar item, persisted immediately.
- Right-click (or hover menu) a sidebar item → Edit (label/color) or Remove.
- Removing destroys the view and **clears that partition's session data** (so a removed
  account is truly gone), then persists.

**Acceptance:**
- Add an account from the UI → new isolated session appears and works; survives restart.
- Edit label/color → reflected immediately and after restart.
- Remove an account → gone from sidebar and disk; its `WebContentsView` destroyed; no
  leftover session (re-adding requires a fresh login).
- Works with at least 4 accounts simultaneously (the author's stated need).

### Phase 5 — Browser chrome (navigation)
**Goal:** each pane behaves like a real browser within its account.
- Top bar: back, forward, reload, editable address field.
- Buttons/field act on the **active** account's `webContents`.
- Address field shows the live URL of the active view and updates on navigation; typing a
  URL/`Enter` navigates (prefix `https://` if missing).
- Back/forward enabled state reflects the active view's history.
- New-window/popup handling per §4.6 (stays in the same session).

**Acceptance:**
- Navigate from Gmail to Calendar to Drive within one account via the address bar — all
  stay logged in to that same account.
- Back/forward/reload work and reflect correct enabled state.
- Switching accounts swaps the address bar to the new active view's URL.

### Phase 6 — Visual identity + unread badges
**Goal:** tell accounts apart at a glance; surface unread counts.
- Sidebar item = colored avatar (account color bg + first letter of label) with the
  account color as ring/indicator; tooltip shows full label.
- Active account clearly indicated.
- Parse page title for unread count (§4.8); show numeric badge on the sidebar item;
  update live; clear at zero.

**Acceptance:**
- Four accounts are visually distinguishable by color + initial.
- Gmail unread count appears as a badge and changes as the inbox changes (manual check:
  read/receive mail, watch the badge).

### Phase 7 — Notifications + keyboard shortcuts (completes the "first complete cut")
**Goal:** background awareness + fast switching.
- Allow notification permission per session; verify Google notifications appear as native
  macOS notifications.
- A background account with activity shows a dot/badge on its sidebar item.
- Clicking a notification switches to the originating account.
- Cmd-1 … Cmd-9 switch to the Nth account.

**Acceptance:**
- Receiving mail in a non-active account produces a native notification and a sidebar
  indicator.
- Clicking the notification focuses the window and switches to that account.
- Cmd-1..9 switch accounts.

### Phase 8+ — Optional polish (only if desired later)
Mute/notification rules per account; "show count only" badge mode; spell-check/zoom;
remember scroll position; download handling. **Do not build unless explicitly requested.**

---

## 6. Verification & Self-Checking (how the loop proves its work)

GUI apps resist full automation, so combine automated checks (the loop runs them itself)
with a few precise manual checks (the loop reports them for the human to confirm).

### 6.1 Boot smoke test (automated, from Phase 0)
A Playwright `_electron.launch()` test that starts the built app, waits for the window,
and asserts the title and that the sidebar shell rendered. Wire as `npm run test:smoke`.
The loop runs this every phase.

### 6.2 Isolation test (automated, from Phase 2 — the most important test)
Programmatically prove sessions don't bleed:
- Get the two account partitions' `session` objects in main (expose a test-only IPC or
  use Playwright to evaluate in the main context).
- Set a cookie in account A's session for `https://google.com`; assert it is **absent**
  from account B's session, and vice versa.
- Assert each account's `WebContentsView` reports a distinct partition string.
Wire as `npm run test:isolation`. This MUST pass before any phase after Phase 2 is
considered done.

### 6.3 Manual checks (the loop lists these in its phase report)
Anything requiring a real Google login (persistence across restart, unread badges,
notifications). The loop should write a short "Manual verification steps" checklist into
each phase's commit/PR description so the human can confirm in under a minute.

### 6.4 Standing quality gates (every phase)
- `tsc --noEmit` clean (strict).
- App launches with zero errors logged in main or renderer consoles.
- No use of `<webview>`, `BrowserView`, `nodeIntegration: true`, or `contextIsolation:
  false` (grep guard in CI script).

---

## 7. Guidance for Loop-Based Development

This section is for the Claude Code loop building Glide.

1. **One phase per iteration.** Read this doc, find the lowest-numbered phase whose
   acceptance criteria don't yet pass, implement only that phase, verify, commit, stop.
2. **Verify before advancing.** Run `npm run build`, `npm run test:smoke`, and (from
   Phase 2) `npm run test:isolation`. If anything fails, fix it in the same iteration —
   do not move on.
3. **Commit per phase** with a message like `Phase 3: persistence of accounts + window
   state`. Keep a running `PROGRESS.md` noting which phases pass and any manual checks
   pending human confirmation.
4. **Respect non-goals (§2.2).** If you find yourself adding distribution, Windows
   support, extra integrations, or tests beyond §6, stop — it's out of scope.
5. **Keep the stack fixed (§3).** Do not swap Electron APIs. Specifically: account content
   is always `WebContentsView` + a `persist:` partition. Never `<webview>`/`BrowserView`.
6. **Security defaults are requirements, not suggestions:** `contextIsolation: true`,
   `nodeIntegration: false`, no preload on account views, popups stay in-partition.
7. **When a phase needs a human (real Google login), say so explicitly** in the phase
   report with exact steps, rather than faking it or marking it done.
8. **Prefer the smallest change that satisfies the acceptance criteria.** This is a
   personal tool; clarity beats cleverness.

### 7.1 Suggested repo layout
```
glide/
├── REQUIREMENTS.md          ← this file (source of truth)
├── PROGRESS.md              ← loop-maintained phase status + pending manual checks
├── CLAUDE.md                ← short pointer: "read REQUIREMENTS.md; build one phase/iteration"
├── package.json
├── electron.vite.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts         ← window, app lifecycle
│   │   ├── accounts.ts      ← account model + WebContentsView lifecycle/layout/switching
│   │   ├── persistence.ts   ← read/write PersistedState JSON
│   │   ├── notifications.ts ← permission handlers, click routing
│   │   └── ipc.ts           ← typed IPC handlers
│   ├── preload/
│   │   └── index.ts         ← contextBridge: window.glide
│   └── renderer/
│       ├── App.tsx          ← layout
│       ├── Sidebar.tsx      ← account list, [+], badges, active state
│       └── TopBar.tsx       ← address + back/fwd/reload
└── tests/
    ├── smoke.spec.ts
    └── isolation.spec.ts
```

---

## 8. Open Questions / Defaults Chosen
- **OS:** macOS only (author's machine is macOS). No cross-platform code.
- **Default home URL:** `https://mail.google.com`. Editable per account.
- **Account count:** configurable; the author runs ~4. No hard cap (Cmd-1..9 covers 9).
- **Avatars:** generated from label initial + color. (Auto-fetching the Google profile
  picture is a possible Phase 8 nicety, not required.)
- These were resolved during scoping; revisit only if the author asks.

---

## Sources (research)
- [What is Shift Browser — shift.com](https://shift.com/blog/what-is-shift-browser-one-window-for-everything-you-do-online/)
- [How to Manage Multiple Google Accounts — shift.com](https://shift.com/guides/multiple-accounts/how-to-manage-multiple-google-accounts/)
- [Shift app review 2026 (architecture, sidebar UX, containers) — email-tools.me](https://email-tools.me/posts/shift-review/)
- [Electron `session` / partitions docs](https://www.electronjs.org/docs/latest/api/session)
