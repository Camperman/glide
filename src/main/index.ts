import { app, BrowserWindow, shell } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { AccountManager, isExternalProtocol, type AccountConfig } from './accounts'
import { DownloadManager } from './downloads'
import { ExtensionManager } from './extensions'
import { HistoryManager } from './history'
import { OmniboxManager } from './omnibox'
import { PrefsManager } from './prefs'
import { startAutoUpdate } from './updater'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { loadState, saveState, type PersistedState } from './persistence'

// Give Glide its own userData directory (unpackaged Electron otherwise shares
// the generic "Electron" dir with every other dev app).
app.setName('Glide')

// Tests point this at a throwaway dir so they don't collide with (or mutate) a
// running app's data or single-instance lock. Must run before app is ready.
if (process.env.GLIDE_USER_DATA_DIR) {
  app.setPath('userData', process.env.GLIDE_USER_DATA_DIR)
}

let accounts: AccountManager | undefined
let prefs: PrefsManager | undefined
let historyRef: HistoryManager | undefined
let state: PersistedState = { version: 1, accounts: [] }
let persistTimer: NodeJS.Timeout | undefined

function buildState(): PersistedState {
  const focused = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const bounds = focused && !focused.isDestroyed() ? focused.getBounds() : undefined
  return {
    version: 1,
    accounts: accounts ? accounts.snapshotAccounts() : state.accounts,
    activeAccountId: accounts?.defaultActiveId() ?? state.activeAccountId,
    window: bounds
      ? { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y }
      : state.window,
    zoomFactor: accounts?.getZoom() ?? state.zoomFactor,
    layout: accounts?.getLayout() ?? state.layout,
    bookmarksBar: accounts?.getBookmarksBarVisible() ?? state.bookmarksBar,
    seededPasswordsApp: state.seededPasswordsApp,
    prefs: prefs?.snapshot() ?? state.prefs
  }
}

// One-time: add the Passwords app to existing profiles that don't have it.
function seedPasswordsApp(): void {
  if (state.seededPasswordsApp) return
  for (const account of state.accounts) {
    if (account.shortcuts && !account.shortcuts.some((s) => s.url.includes('passwords.google.com'))) {
      account.shortcuts.push({
        id: randomUUID(),
        label: 'Passwords',
        url: 'https://passwords.google.com'
      })
    }
  }
  state.seededPasswordsApp = true
  saveState(state)
}

function installMenu(): void {
  const focused = (): BrowserWindow | null => BrowserWindow.getFocusedWindow()
  buildAppMenu({
    newWindow: () => createWindow(),
    openPreferences: () => focused()?.webContents.send('menu:preferences'),
    newTab: () => {
      const win = focused()
      if (win) accounts?.newTabInActive(win)
    },
    closeTab: () => {
      const win = focused()
      if (win) accounts?.closeActiveTab(win)
    },
    reopenTab: () => {
      const win = focused()
      if (win) accounts?.reopenClosedTab(win)
    },
    nextTab: () => {
      const win = focused()
      if (win) accounts?.cycleTab(win, 1)
    },
    prevTab: () => {
      const win = focused()
      if (win) accounts?.cycleTab(win, -1)
    },
    focusAddress: () => focused()?.webContents.send('menu:focus-address'),
    find: () => {
      const win = focused()
      if (win) accounts?.openFind(win)
    },
    print: () => {
      const win = focused()
      if (win) accounts?.printActive(win)
    },
    // macOS shows its own "use Glide as your default browser?" confirmation.
    setDefaultBrowser: () => {
      app.setAsDefaultProtocolClient('http')
      app.setAsDefaultProtocolClient('https')
    },
    switchToIndex: (index) => {
      const win = BrowserWindow.getFocusedWindow()
      if (win) accounts?.setActiveByIndex(win, index)
    },
    zoomIn: () => accounts?.zoomIn(),
    zoomOut: () => accounts?.zoomOut(),
    zoomReset: () => accounts?.zoomReset(),
    layout: accounts?.getLayout() ?? 'left',
    setLayout: (layout) => {
      accounts?.setLayout(layout)
      installMenu() // rebuild so the radio check reflects the new layout
    },
    bookmarksBar: accounts?.getBookmarksBarVisible() ?? false,
    toggleBookmarksBar: () => {
      accounts?.setBookmarksBarVisible(!accounts.getBookmarksBarVisible())
      installMenu()
    },
    importBookmarks: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:import-bookmarks')
  })
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
  const isFirst = BrowserWindow.getAllWindows().length === 0
  const win = new BrowserWindow({
    width: state.window?.width ?? 1280,
    height: state.window?.height ?? 800,
    // Only the first window restores the saved position; extra windows cascade.
    x: isFirst ? state.window?.x : undefined,
    y: isFirst ? state.window?.y : undefined,
    title: 'Glide',
    show: false,
    backgroundColor: prefs?.windowBackground() ?? '#202124',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 8 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('resize', schedulePersist)
  win.on('move', schedulePersist)

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // The manager builds this window's account views once the page is ready.
  win.webContents.once('did-finish-load', () => {
    accounts?.registerWindow(win, state.activeAccountId)
    // Links that arrived while the app was still launching.
    for (const url of pendingUrls.splice(0)) accounts?.openUrlInActiveAccount(url)
  })
}

// Only one Glide process per macOS user. Multiple processes would each open the
// same per-user session partitions and fight over Chromium's LevelDB locks,
// corrupting the data and crashing. A second launch opens a new window instead.
const gotInstanceLock = app.requestSingleInstanceLock()
if (!gotInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (accounts) createWindow()
})

// Links sent to Glide by macOS (when Glide is the default browser, or
// `open -a Glide <url>`). Can fire before ready/windows exist — queue those.
const pendingUrls: string[] = []
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (accounts && BrowserWindow.getAllWindows().length > 0) {
    accounts.openUrlInActiveAccount(url)
  } else {
    pendingUrls.push(url)
  }
})

// Forward app-protocol links (Zoom, mailto, Teams, …) to the OS from any web
// contents, including popup windows opened by pages.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (isExternalProtocol(url)) {
      e.preventDefault()
      void shell.openExternal(url).catch(() => {})
    }
  })
})

app.whenReady().then(() => {
  if (!gotInstanceLock) return
  state = loadState()
  seedPasswordsApp()

  const downloads = new DownloadManager()
  ExtensionManager.handleCRXProtocol() // serve crx:// icons for the toolbar UI
  const extensions = new ExtensionManager()
  const history = new HistoryManager()
  history.load()
  historyRef = history
  accounts = new AccountManager(schedulePersist, downloads, extensions, history)
  extensions.setDelegate(accounts)
  prefs = new PrefsManager(state.prefs)
  prefs.start((p) => {
    accounts?.setBrowsingPrefs(p)
    downloads.configure(p)
    schedulePersist()
  })
  const omnibox = new OmniboxManager(accounts, history, prefs)
  registerIpc(accounts, createWindow, downloads, prefs, extensions, omnibox)

  const configs: AccountConfig[] = [...state.accounts]
    .sort((a, b) => a.order - b.order)
    .map((a) => ({
      id: a.id,
      label: a.label,
      color: a.color,
      homeUrl: a.homeUrl,
      lastUrl: a.lastUrl,
      shortcuts: a.shortcuts,
      avatarUrl: a.avatarUrl,
      bookmarks: a.bookmarks,
      muted: a.muted
    }))
  accounts.loadMetadata(configs)
  if (state.zoomFactor) accounts.setZoom(state.zoomFactor)
  if (state.layout) accounts.setLayout(state.layout)
  if (state.bookmarksBar) accounts.setBookmarksBarVisible(true)

  installMenu()
  createWindow()
  startAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', persistNow)
app.on('before-quit', () => historyRef?.save())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
