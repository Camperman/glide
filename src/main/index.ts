import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { AccountManager, type AccountConfig } from './accounts'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { loadState, saveState, type PersistedState } from './persistence'

// Give Glide its own userData directory (unpackaged Electron otherwise shares
// the generic "Electron" dir with every other dev app).
app.setName('Glide')

let mainWindow: BrowserWindow | undefined
let accounts: AccountManager | undefined
let state: PersistedState = { version: 1, accounts: [] }

let persistTimer: NodeJS.Timeout | undefined

function buildState(): PersistedState {
  const bounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : undefined
  return {
    version: 1,
    accounts: accounts ? accounts.snapshotAccounts() : state.accounts,
    activeAccountId: accounts?.getActiveId() ?? state.activeAccountId,
    window: bounds
      ? { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y }
      : state.window
  }
}

function persistNow(): void {
  state = buildState()
  saveState(state)
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(persistNow, 400)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: state.window?.width ?? 1280,
    height: state.window?.height ?? 800,
    x: state.window?.x,
    y: state.window?.y,
    title: 'Glide',
    show: false,
    backgroundColor: '#1b1d22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => win.show())
  win.on('resize', schedulePersist)
  win.on('move', schedulePersist)

  // The React renderer is the base layer (sidebar + chrome); account
  // WebContentsViews are overlaid on top of it.
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Restore accounts from persisted state, each on its own isolated partition.
  accounts = new AccountManager(win, schedulePersist)
  registerIpc(accounts)

  const configs: AccountConfig[] = [...state.accounts]
    .sort((a, b) => a.order - b.order)
    .map((a) => ({
      id: a.id,
      label: a.label,
      color: a.color,
      homeUrl: a.homeUrl,
      lastUrl: a.lastUrl
    }))
  accounts.load(configs)

  if (state.activeAccountId) accounts.setActive(state.activeAccountId)

  buildAppMenu((index) => accounts?.setActiveByIndex(index))
}

app.whenReady().then(() => {
  state = loadState()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', persistNow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
