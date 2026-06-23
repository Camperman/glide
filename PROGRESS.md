# Glide — Progress

Loop-maintained status of the phased build (see REQUIREMENTS.md §5).
Legend: ✅ done & verified · 🔧 in progress · ⬜ not started

| Phase | Title | Status |
|---|---|---|
| 0 | Scaffold & boot | ✅ |
| 1 | One isolated account view | ⬜ |
| 2 | Multiple accounts + sidebar switching + isolation proof | ⬜ |
| 3 | Persistence | ⬜ |
| 4 | Account management UI (add/remove/edit) | ⬜ |
| 5 | Browser chrome (navigation) | ⬜ |
| 6 | Visual identity + unread badges | ⬜ |
| 7 | Notifications + keyboard shortcuts | ⬜ |
| 8+ | Optional polish | ⬜ (only if requested) |

## Next up
**Phase 1 — One isolated account view.** Create a single `WebContentsView` with
partition `persist:account-default`, load `https://mail.google.com`, position it
right of the 64px sidebar, and keep it sized on window resize.

## Pending manual checks (need a real Google login)
_None yet. Phase 1 will add: "log in, quit, relaunch → still logged in."_

## Phase log
- **Phase 0 — ✅** Scaffolded electron-vite + React + TypeScript. Window opens at
  1280×800 titled "Glide" with the sidebar shell. `npm run guard`, `npm run build`,
  and `npm run test:smoke` all pass. Security defaults set (contextIsolation on,
  nodeIntegration off, preload via contextBridge).
