import { BrowserWindow, app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// True while a user-initiated check/download is in flight, so we surface
// errors loudly (the automatic background checks stay silent — failures there
// are expected on unsigned local builds and before a release has artifacts).
let interactive = false
let lastState: UpdateState = { status: 'idle' }

function broadcast(state: UpdateState): void {
  lastState = state
  const fraction =
    state.status === 'downloading' ? Math.max(0, Math.min(1, (state.percent ?? 0) / 100)) : -1
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.setProgressBar(state.status === 'downloading' ? fraction : -1)
    win.webContents.send('update:state', state)
  }
}

export function getUpdateState(): UpdateState {
  return lastState
}

/** Restart and install a downloaded update (the in-app "Restart" affordance). */
export function restartToUpdate(): void {
  autoUpdater.quitAndInstall()
}

/** Menu / Preferences "Check for Updates…": same updater, but with answers —
 *  up-to-date, downloading (with progress), or the error the silent path
 *  swallows. */
export async function checkForUpdatesInteractive(): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Updates are available only in the installed app',
      detail: `This is a development build (v${app.getVersion()}).`
    })
    return
  }
  // Already downloaded and waiting? Offer the restart straight away.
  if (lastState.status === 'ready') {
    promptRestart(lastState.version)
    return
  }
  interactive = true
  broadcast({ status: 'checking' })
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result?.isUpdateAvailable) {
      broadcast({ status: 'downloading', percent: 0, version: result.updateInfo.version })
      await dialog.showMessageBox({
        type: 'info',
        message: `Flit ${result.updateInfo.version} is downloading`,
        detail:
          'Progress shows in the toolbar and the Dock. You’ll be prompted to restart when it’s ready.'
      })
    } else {
      interactive = false
      broadcast({ status: 'idle' })
      await dialog.showMessageBox({
        type: 'info',
        message: 'You’re up to date',
        detail: `Flit ${app.getVersion()} is the latest version.`
      })
    }
  } catch (error) {
    interactive = false
    broadcast({ status: 'error', message: `${error instanceof Error ? error.message : error}` })
    await dialog.showMessageBox({
      type: 'warning',
      message: 'Couldn’t check for updates',
      detail: `${error instanceof Error ? error.message : error}`
    })
  }
}

let prompted = false
function promptRestart(version?: string): void {
  void dialog
    .showMessageBox({
      type: 'info',
      message: `Flit ${version ?? ''} is ready to install`.replace('  ', ' '),
      detail: 'The update was downloaded. Restart to finish installing.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
      // "Later" → installs automatically on next quit.
    })
}

/**
 * Auto-update from GitHub Releases (Camperman/flit, public — no token needed
 * to download). Checks shortly after launch and every few hours; downloads in
 * the background with progress feedback, and offers a restart when ready.
 * No-ops in dev and for unsigned local builds (updates require a valid
 * signature). Errors are surfaced only when the user asked (interactive).
 */
export function startAutoUpdate(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    broadcast({ status: 'downloading', percent: 0, version: info.version })
  })

  autoUpdater.on('download-progress', (p) => {
    broadcast({ status: 'downloading', percent: p.percent, version: lastState.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    interactive = false
    broadcast({ status: 'ready', version: info.version })
    if (prompted) return
    prompted = true
    promptRestart(info.version)
  })

  autoUpdater.on('error', (err) => {
    broadcast({ status: interactive ? 'error' : 'idle', message: `${err?.message ?? err}` })
    if (interactive) {
      interactive = false
      void dialog.showMessageBox({
        type: 'warning',
        message: 'Update failed',
        detail: `${err?.message ?? err}`
      })
    }
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => {})
  }
  setTimeout(check, 15_000) // let launch settle first
  const timer = setInterval(check, CHECK_INTERVAL_MS)
  timer.unref?.()
}
