# Flit

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
- Can be your **default browser** (File → Set as Default Browser…) — links from
  other apps open as a tab in your active account

## Install (macOS, Apple Silicon)

Download the latest DMG from [Releases](../../releases), open it, and drag
Flit to Applications.

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
# One-time: store notarization credentials in the keychain profile "flit".
xcrun notarytool store-credentials flit --apple-id "you@example.com" --team-id "XXXXXXXXXX"
```

After `npm run dist`, optionally notarize + staple the DMG container itself
(the app inside is already notarized; this just makes the DMG validate too):

```sh
xcrun notarytool submit dist/Flit-*.dmg --keychain-profile flit --wait
xcrun stapler staple dist/Flit-*.dmg
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
