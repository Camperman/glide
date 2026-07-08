# Glide

A macOS desktop app for running multiple Google accounts side by side — each in
its own fully isolated, permanently-signed-in session — switching between them
from a left sidebar. Like Slack's workspace switcher, but every item is a
complete Google session (Gmail, Calendar, Drive, Meet, …).

Built on Electron: each account lives in its own persistent session partition,
so accounts never bleed into each other and never log each other out.

## Features

- **Isolated accounts** — one click to switch; every account stays signed in
- **Real browser tabs** per account, plus a per-account app rail and bookmarks bar
  (with Chrome bookmark import)
- **Unread badges** and native notifications, attributable to the account —
  per-account mute, click a notification to jump to that account
- **Chrome extensions** — installed per account from the Chrome Web Store
  (uBlock Origin Lite, etc.)
- **Downloads**, multiple windows, Google Meet screen-sharing, Cmd-1…9 account
  switching

## Install (macOS, Apple Silicon)

Download the latest DMG from [Releases](../../releases), open it, and drag
Glide to Applications.

## Build from source

```sh
npm install
npm start            # dev with hot reload
npm run package      # local unsigned .app in dist/mac-arm64/
npm run dist         # signed + notarized DMG (requires signing setup below)
```

### Signing setup (maintainers)

`npm run dist` expects a **Developer ID Application** certificate in the
keychain and these environment variables for notarization:

```sh
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com → App-Specific Passwords
export APPLE_TEAM_ID="XXXXXXXXXX"                          # developer.apple.com → Membership
```

## Notes & limitations

- macOS only, Apple Silicon builds.
- Passkey sign-in over Bluetooth and Touch ID passkeys are not supported yet;
  use "Tap Yes on your phone", an authenticator code, or a password when
  signing in. Sessions persist, so this is one-time per account.
- Extensions needing native messaging (e.g. 1Password's biometric unlock) work
  only partially.
- Development history and architecture live in
  [REQUIREMENTS.md](REQUIREMENTS.md) and [PROGRESS.md](PROGRESS.md).

## License

[GPL-3.0](LICENSE). Extension support is provided by
[electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell)
(dual-licensed; used here under GPL-3.0).
