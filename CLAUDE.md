# Flit (formerly Glide) — instructions for Claude Code

**Flit** (renamed from Glide, 2026-07-08) is a personal macOS desktop app for running multiple isolated Google
accounts side by side, switching between them from a left sidebar. A scoped-down
clone of Shift Browser's core feature. Not distributed; single user.

## The one rule of this repo
**[REQUIREMENTS.md](REQUIREMENTS.md) is the source of truth.** Read it before doing
anything. It defines the fixed tech stack (§3), architecture (§4), the phased build
plan (§5), and verification (§6).

## How to work (loop-based development)
1. Read `PROGRESS.md` to see which phase is next.
2. Implement **only that one phase** from REQUIREMENTS.md §5. Smallest change that
   satisfies the phase's acceptance criteria.
3. Verify (Definition of Done — every phase):
   - `npm run guard` — banned-pattern check passes
   - `npm run build` — typecheck + bundle, zero TS errors
   - `npm run test:smoke` — app boots clean
   - from Phase 2 on: `npm run test:isolation` — sessions don't bleed (MUST pass)
4. Update `PROGRESS.md`: mark the phase done, list any pending **manual** checks
   (anything needing a real Google login — do not fake these).
5. Commit with a message naming the phase (e.g. `Phase 3: persistence`). Stop.

## Hard constraints (do not violate)
- Account content is always `WebContentsView` + a `persist:account-<id>` partition.
  **Never** `<webview>` or `BrowserView` (the guard script enforces this).
- `contextIsolation: true`, `nodeIntegration: false`. Account views get no preload.
- macOS only. No distribution, installers, auto-update, or signing.
- Respect the non-goals in REQUIREMENTS.md §2.2. If a change drifts out of scope, stop.

## Commands
- `npm start` — run in dev (hot reload)
- `npm run build` — typecheck + production bundle to `out/`
- `npm run test:smoke` — Playwright boot test against the built app
- `npm run guard` — quality gate
