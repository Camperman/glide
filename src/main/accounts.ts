import {
  BrowserWindow,
  Menu,
  WebContents,
  WebContentsView,
  desktopCapturer,
  session,
  shell
} from 'electron'
import { randomUUID } from 'crypto'
import type {
  AccountPatch,
  AccountSummary,
  AppInfo,
  AppRailLayout,
  BookmarkFolder,
  BookmarkNode,
  ChromeProfile,
  NavState,
  NewAccountInput,
  Shortcut,
  ShortcutInput,
  ShortcutPatch,
  TabInfo
} from '../shared/types'
import type { MenuItemConstructorOptions } from 'electron'
import type { PersistedAccount } from './persistence'
import { listChromeProfiles, readChromeBookmarkBar } from './chromeBookmarks'

export const SIDEBAR_WIDTH = 64
export const APP_RAIL_WIDTH = 84
export const TITLE_BAR_HEIGHT = 38
export const TOP_BAR_HEIGHT = 44
export const BOOKMARKS_BAR_HEIGHT = 36

const NEW_TAB_URL = 'https://www.google.com'

// Idle background views are discarded (unloaded) after this long to save memory,
// then reloaded on return. The active/visible view is never discarded.
const DISCARD_IDLE_MS = 30 * 60 * 1000
const DISCARD_SWEEP_MS = 5 * 60 * 1000

function defaultShortcuts(): Shortcut[] {
  return [
    { label: 'Mail', url: 'https://mail.google.com' },
    { label: 'Calendar', url: 'https://calendar.google.com' },
    { label: 'Drive', url: 'https://drive.google.com' },
    { label: 'Docs', url: 'https://docs.google.com' },
    { label: 'Sheets', url: 'https://sheets.google.com' },
    { label: 'Meet', url: 'https://meet.google.com' },
    { label: 'Contacts', url: 'https://contacts.google.com' },
    { label: 'Passwords', url: 'https://passwords.google.com' }
  ].map((s) => ({ id: randomUUID(), ...s }))
}

const GRANTED_PERMISSIONS = new Set([
  'notifications',
  'media',
  'mediaKeySystem',
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
  'pointerLock'
])

export interface AccountConfig {
  id: string
  label: string
  color: string
  homeUrl: string
  lastUrl?: string
  shortcuts?: Shortcut[]
  avatarUrl?: string
  bookmarks?: BookmarkNode[]
}

/** Shared, persisted metadata for an account (not window-specific). */
interface AccountMeta {
  id: string
  label: string
  color: string
  homeUrl: string
  lastUrl: string
  shortcuts: Shortcut[]
  bookmarks: BookmarkNode[]
  avatarUrl?: string
}

/** One open browser tab within an account, in a specific window. `view` is
 *  undefined when the tab is discarded (unloaded for memory); it's recreated on
 *  next activation from `currentUrl`. `lastActive` drives idle discarding. */
interface Tab {
  id: string
  view?: WebContentsView
  currentUrl: string
  title: string
  favicon?: string
  originShortcutId?: string
  lastActive: number
}

/** Per-window state for a single account (its open tabs in that window). */
interface WindowAccount {
  tabs: Tab[]
  activeTabId?: string
  unreadByApp: Record<string, number>
}

/** All per-window view state for one BrowserWindow. */
interface WindowState {
  win: BrowserWindow
  activeAccountId?: string
  overlayOpen: boolean
  perAccount: Map<string, WindowAccount>
}

const AVATAR_SCRIPT = `(() => {
  const sels = [
    'a[aria-label*="Google Account"] img',
    'a[href^="https://accounts.google.com/SignOutOptions"] img',
    'img.gbii', 'img.gb_P'
  ]
  for (const s of sels) {
    const el = document.querySelector(s)
    if (el && el.src && el.src.indexOf('http') === 0) return el.src
  }
  return null
})()`

export function partitionFor(id: string): string {
  return `persist:account-${id}`
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function resolveQuery(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  const looksLikeUrl =
    !/\s/.test(trimmed) &&
    (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) ||
      /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(trimmed) ||
      /^[^\s/.]+\.[^\s/.]+/.test(trimmed))
  if (looksLikeUrl) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

export function parseUnread(title: string): number {
  const match = title.match(/\((\d+)\)/)
  return match ? parseInt(match[1], 10) : 0
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** True for app-protocol links (zoommtg:, mailto:, msteams:, tel:, …) that the
 *  OS should open in their native app rather than the in-app browser. */
export function isExternalProtocol(url: string): boolean {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url)
  if (!match) return false
  const scheme = match[1].toLowerCase()
  return !['http', 'https', 'about', 'blob', 'data', 'file', 'chrome', 'devtools', 'filesystem'].includes(
    scheme
  )
}

function findFolder(nodes: BookmarkNode[], id: string): BookmarkFolder | undefined {
  for (const node of nodes) {
    if (node.type === 'folder') {
      if (node.id === id) return node
      const nested = findFolder(node.children, id)
      if (nested) return nested
    }
  }
  return undefined
}

/**
 * Owns account metadata (shared, persisted) and the per-window view state for
 * every open window. Each account has its own persistent session partition
 * (`persist:account-<id>`) shared by all of that account's tabs across all
 * windows, so logins never bleed across accounts but are shared between windows.
 *
 * Metadata + app settings are global; tabs / active selection / unread are
 * per-window. Metadata mutations broadcast to every window; `onState` persists.
 */
export class AccountManager {
  private readonly onState?: () => void
  private readonly accounts = new Map<string, AccountMeta>()
  private order: string[] = []
  private readonly windows = new Map<number, WindowState>()
  private zoomFactor = 1
  private railLayout: AppRailLayout = 'left'
  private bookmarksBar = false

  constructor(onState?: () => void) {
    this.onState = onState
    const timer = setInterval(() => this.discardIdle(), DISCARD_SWEEP_MS)
    timer.unref?.() // don't keep the process alive just for the sweep
  }

  // ---- metadata loading -------------------------------------------------

  loadMetadata(configs: AccountConfig[]): void {
    for (const config of configs) this.addMeta(config)
  }

  private addMeta(config: AccountConfig): AccountMeta {
    const ses = session.fromPartition(partitionFor(config.id))
    ses.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(GRANTED_PERMISSIONS.has(permission))
    )
    ses.setPermissionCheckHandler((_wc, permission) => GRANTED_PERMISSIONS.has(permission))

    // Enable screen sharing (Google Meet getDisplayMedia). On macOS 15+ the
    // native system picker is used; otherwise we fall back to sharing the
    // primary screen. Requires the OS "Screen Recording" permission for Glide.
    ses.setDisplayMediaRequestHandler(
      (_request, callback) => {
        desktopCapturer
          .getSources({ types: ['screen', 'window'] })
          .then((sources) => callback(sources.length ? { video: sources[0] } : {}))
          .catch(() => callback({}))
      },
      { useSystemPicker: true }
    )

    const meta: AccountMeta = {
      id: config.id,
      label: config.label,
      color: config.color,
      homeUrl: config.homeUrl,
      lastUrl: config.lastUrl ?? config.homeUrl,
      shortcuts:
        config.shortcuts && config.shortcuts.length > 0 ? config.shortcuts : defaultShortcuts(),
      bookmarks: config.bookmarks ?? [],
      avatarUrl: config.avatarUrl
    }
    this.accounts.set(meta.id, meta)
    if (!this.order.includes(meta.id)) this.order.push(meta.id)
    return meta
  }

  // ---- window lifecycle -------------------------------------------------

  /** Register a new BrowserWindow: build its views and wire its handlers. */
  registerWindow(win: BrowserWindow, defaultActiveId?: string): void {
    // The first window is eager (loads every profile up front, so all unread
    // badges show and switching is instant). Additional windows are lazy —
    // they load a profile only when you first switch to it — to save memory.
    const eager = this.windows.size === 0
    const ws: WindowState = { win, overlayOpen: false, perAccount: new Map() }
    this.windows.set(win.id, ws)

    win.on('resize', () => this.layout(ws))
    win.on('closed', () => this.unregisterWindow(win.id))

    if (eager) {
      for (const id of this.order) this.ensureLoaded(ws, id)
    }

    const initial = defaultActiveId && this.accounts.has(defaultActiveId) ? defaultActiveId : this.order[0]
    if (initial) this.setActive(win, initial)
  }

  private unregisterWindow(winId: number): void {
    const ws = this.windows.get(winId)
    if (!ws) return
    for (const wa of ws.perAccount.values()) {
      for (const tab of wa.tabs) if (tab.view) this.destroyView(ws, tab.view)
    }
    this.windows.delete(winId)
  }

  private wsFor(win: BrowserWindow): WindowState | undefined {
    return this.windows.get(win.id)
  }

  private allWindows(): WindowState[] {
    return [...this.windows.values()]
  }

  // ---- per-window tab/view management -----------------------------------

  private accountState(ws: WindowState, accountId: string): WindowAccount {
    let wa = ws.perAccount.get(accountId)
    if (!wa) {
      wa = { tabs: [], activeTabId: undefined, unreadByApp: {} }
      ws.perAccount.set(accountId, wa)
    }
    return wa
  }

  /** Ensure this window has at least the account's initial tab loaded. */
  private ensureLoaded(ws: WindowState, accountId: string): void {
    const meta = this.accounts.get(accountId)
    if (!meta) return
    const wa = this.accountState(ws, accountId)
    if (wa.tabs.length > 0) return
    const restoreUrl = meta.lastUrl || meta.homeUrl
    const origin = meta.shortcuts.find((s) => hostOf(s.url) === hostOf(restoreUrl))?.id
    const tab = this.openTab(ws, accountId, restoreUrl, origin)
    wa.activeTabId = tab.id
  }

  private openTab(
    ws: WindowState,
    accountId: string,
    url: string,
    originShortcutId?: string
  ): Tab {
    const tab: Tab = {
      id: randomUUID(),
      currentUrl: url,
      title: '',
      originShortcutId,
      lastActive: Date.now()
    }
    this.createView(ws, accountId, tab)
    this.accountState(ws, accountId).tabs.push(tab)
    return tab
  }

  /** Build (or rebuild, after a discard) the live view for a tab record. */
  private createView(ws: WindowState, accountId: string, tab: Tab): void {
    const part = partitionFor(accountId)
    const view = new WebContentsView({
      webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false }
    })
    view.setBackgroundColor('#ffffff')
    const wc = view.webContents
    tab.view = view

    const isActiveTab = (): boolean =>
      ws.activeAccountId === accountId &&
      this.accountState(ws, accountId).activeTabId === tab.id

    wc.on('did-finish-load', () => {
      wc.setZoomFactor(this.zoomFactor)
      this.extractAvatar(accountId, wc)
      setTimeout(() => this.extractAvatar(accountId, wc), 2000)
    })

    const onNav = (): void => {
      tab.currentUrl = wc.getURL()
      const meta = this.accounts.get(accountId)
      if (meta) meta.lastUrl = tab.currentUrl
      this.onState?.()
      if (isActiveTab()) this.emitNav(ws)
    }
    wc.on('did-navigate', onNav)
    wc.on('did-navigate-in-page', (_e, _u, isMainFrame) => {
      if (isMainFrame) onNav()
    })
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      const wa = this.accountState(ws, accountId)
      if (tab.originShortcutId) {
        const count = parseUnread(title)
        if (wa.unreadByApp[tab.originShortcutId] !== count) {
          wa.unreadByApp[tab.originShortcutId] = count
          this.emitUnread(ws, accountId)
          if (ws.activeAccountId === accountId) this.emitApps(ws, accountId)
        }
      }
      if (ws.activeAccountId === accountId) this.emitTabs(ws, accountId)
      if (isActiveTab()) this.emitNav(ws)
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      const icon = favicons[0]
      if (!icon || icon === tab.favicon) return
      tab.favicon = icon
      if (tab.originShortcutId) {
        const meta = this.accounts.get(accountId)
        const shortcut = meta?.shortcuts.find((s) => s.id === tab.originShortcutId)
        if (shortcut && shortcut.favicon !== icon) {
          shortcut.favicon = icon
          this.onState?.()
          this.broadcastShortcuts(accountId)
        }
      }
      if (ws.activeAccountId === accountId) {
        this.emitTabs(ws, accountId)
        this.emitApps(ws, accountId)
      }
    })

    wc.setWindowOpenHandler(({ url }) => {
      // App-protocol popups (e.g. zoommtg://) → hand off to the OS / native app.
      if (isExternalProtocol(url)) {
        void shell.openExternal(url).catch(() => {})
        return { action: 'deny' }
      }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false }
        }
      }
    })

    // Popups (auth, compose, …) share this account's partition. When a Google
    // sign-in popup closes, reload the opener so the completed login is picked
    // up (the auth cookie is already in this partition).
    wc.on('did-create-window', (child) => {
      let sawAuth = false
      const check = (_e: unknown, navUrl: string): void => {
        if (navUrl.includes('accounts.google.com')) sawAuth = true
      }
      child.webContents.on('did-navigate', check)
      child.webContents.on('did-navigate-in-page', check)
      child.on('closed', () => {
        if (sawAuth && !wc.isDestroyed()) wc.reload()
      })
    })

    // In-page navigations to app protocols (Zoom's "launch meeting", mailto, …).
    wc.on('will-navigate', (e, url) => {
      if (isExternalProtocol(url)) {
        e.preventDefault()
        void shell.openExternal(url).catch(() => {})
      }
    })

    view.setVisible(false)
    ws.win.contentView.addChildView(view)
    void wc.loadURL(tab.currentUrl)
  }

  /** Ensure the active tab has a live view (rebuild if discarded) and mark used. */
  private materializeActive(ws: WindowState): void {
    if (!ws.activeAccountId) return
    const wa = ws.perAccount.get(ws.activeAccountId)
    if (!wa?.activeTabId) return
    const tab = wa.tabs.find((t) => t.id === wa.activeTabId)
    if (!tab) return
    if (!tab.view) this.createView(ws, ws.activeAccountId, tab)
    tab.lastActive = Date.now()
  }

  /** Unload background views idle longer than the threshold to reclaim memory. */
  private discardIdle(): void {
    const now = Date.now()
    for (const ws of this.allWindows()) {
      const visibleTabId = ws.activeAccountId
        ? ws.perAccount.get(ws.activeAccountId)?.activeTabId
        : undefined
      for (const [accountId, wa] of ws.perAccount) {
        for (const tab of wa.tabs) {
          const visible = accountId === ws.activeAccountId && tab.id === visibleTabId
          if (visible) {
            tab.lastActive = now // keep the on-screen view fresh
            continue
          }
          if (tab.view && now - tab.lastActive > DISCARD_IDLE_MS) {
            this.destroyView(ws, tab.view)
            tab.view = undefined
          }
        }
      }
    }
  }

  newTab(win: BrowserWindow, accountId: string): void {
    const ws = this.wsFor(win)
    if (!ws) return
    const tab = this.openTab(ws, accountId, NEW_TAB_URL)
    this.accountState(ws, accountId).activeTabId = tab.id
    this.afterTabChange(ws, accountId)
  }

  activateTab(win: BrowserWindow, accountId: string, tabId: string): void {
    const ws = this.wsFor(win)
    if (!ws) return
    const wa = this.accountState(ws, accountId)
    if (!wa.tabs.some((t) => t.id === tabId)) return
    wa.activeTabId = tabId
    this.afterTabChange(ws, accountId)
  }

  reorderTabs(win: BrowserWindow, accountId: string, tabIds: string[]): void {
    const ws = this.wsFor(win)
    if (!ws) return
    const wa = this.accountState(ws, accountId)
    const byId = new Map(wa.tabs.map((t) => [t.id, t]))
    const next: Tab[] = []
    for (const id of tabIds) {
      const tab = byId.get(id)
      if (tab) next.push(tab)
    }
    for (const tab of wa.tabs) if (!tabIds.includes(tab.id)) next.push(tab)
    if (next.length !== wa.tabs.length) return
    wa.tabs = next
    this.emitTabs(ws, accountId)
  }

  closeTab(win: BrowserWindow, accountId: string, tabId: string): void {
    const ws = this.wsFor(win)
    if (!ws) return
    const wa = this.accountState(ws, accountId)
    const index = wa.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return
    const view = wa.tabs[index].view
    if (view) this.destroyView(ws, view)
    wa.tabs.splice(index, 1)
    if (wa.activeTabId === tabId) {
      const neighbour = wa.tabs[index] ?? wa.tabs[index - 1]
      wa.activeTabId = neighbour?.id
    }
    this.afterTabChange(ws, accountId)
  }

  openShortcut(win: BrowserWindow, accountId: string, shortcutId: string): void {
    const ws = this.wsFor(win)
    const meta = this.accounts.get(accountId)
    if (!ws || !meta) return
    const shortcut = meta.shortcuts.find((s) => s.id === shortcutId)
    if (!shortcut) return
    const wa = this.accountState(ws, accountId)
    const existing = wa.tabs.find((t) => t.originShortcutId === shortcutId)
    if (existing) {
      wa.activeTabId = existing.id
    } else {
      const tab = this.openTab(ws, accountId, shortcut.url, shortcutId)
      wa.activeTabId = tab.id
    }
    this.afterTabChange(ws, accountId)
  }

  private afterTabChange(ws: WindowState, accountId: string): void {
    if (ws.activeAccountId === accountId) {
      this.refreshVisibility(ws)
      this.layout(ws)
      this.emitNav(ws)
      this.emitApps(ws, accountId)
    }
    this.emitTabs(ws, accountId)
    this.onState?.()
  }

  private destroyView(ws: WindowState, view: WebContentsView): void {
    try {
      ws.win.contentView.removeChildView(view)
    } catch {
      // window may be gone
    }
    try {
      ;(view.webContents as unknown as { destroy?: () => void }).destroy?.()
    } catch {
      // already gone
    }
  }

  // ---- account metadata mutations (broadcast to all windows) ------------

  addAccount(input: NewAccountInput): string {
    const id = randomUUID()
    this.addMeta({
      id,
      label: input.label.trim() || 'Account',
      color: input.color || '#888888',
      homeUrl: normalizeUrl(input.homeUrl) || 'https://mail.google.com'
    })
    // Make it available (and active) in every open window.
    for (const ws of this.allWindows()) {
      this.ensureLoaded(ws, id)
      this.setActiveWs(ws, id)
    }
    this.broadcastUpdated()
    this.onState?.()
    return id
  }

  updateAccount(id: string, patch: AccountPatch): void {
    const meta = this.accounts.get(id)
    if (!meta) return
    if (patch.label !== undefined) meta.label = patch.label.trim() || meta.label
    if (patch.color !== undefined) meta.color = patch.color
    this.broadcastUpdated()
    this.onState?.()
  }

  async removeAccount(id: string): Promise<void> {
    if (!this.accounts.has(id)) return
    // Destroy this account's views in every window and reassign active there.
    for (const ws of this.allWindows()) {
      const wa = ws.perAccount.get(id)
      if (wa) {
        for (const tab of wa.tabs) if (tab.view) this.destroyView(ws, tab.view)
        ws.perAccount.delete(id)
      }
      if (ws.activeAccountId === id) {
        ws.activeAccountId = undefined
        const next = this.order.find((x) => x !== id)
        if (next) this.setActiveWs(ws, next)
      }
    }
    this.accounts.delete(id)
    this.order = this.order.filter((x) => x !== id)
    try {
      await session.fromPartition(partitionFor(id)).clearStorageData()
    } catch {
      // best-effort
    }
    this.broadcastUpdated()
    this.onState?.()
  }

  // ---- active account (per window) --------------------------------------

  setActive(win: BrowserWindow, id: string): void {
    const ws = this.wsFor(win)
    if (!ws) return
    this.setActiveWs(ws, id)
  }

  private setActiveWs(ws: WindowState, id: string): void {
    if (!this.accounts.has(id)) return
    this.ensureLoaded(ws, id)
    ws.activeAccountId = id
    this.refreshVisibility(ws)
    this.layout(ws)
    if (!ws.win.isDestroyed()) ws.win.webContents.send('accounts:active-changed', id)
    this.emitNav(ws)
    this.emitTabs(ws, id)
    this.emitApps(ws, id)
    this.onState?.()
  }

  getActiveId(win: BrowserWindow): string | undefined {
    return this.wsFor(win)?.activeAccountId
  }

  setActiveByIndex(win: BrowserWindow, index: number): void {
    const id = this.order[index]
    if (id) this.setActive(win, id)
  }

  setOverlayOpen(win: BrowserWindow, open: boolean): void {
    const ws = this.wsFor(win)
    if (!ws) return
    ws.overlayOpen = open
    this.refreshVisibility(ws)
  }

  // ---- settings (global, applied to all windows) ------------------------

  getZoom(): number {
    return this.zoomFactor
  }

  setZoom(factor: number): void {
    this.zoomFactor = Math.round(Math.min(3, Math.max(0.3, factor)) * 100) / 100
    for (const ws of this.allWindows()) {
      for (const wa of ws.perAccount.values()) {
        for (const tab of wa.tabs) tab.view?.webContents.setZoomFactor(this.zoomFactor)
      }
    }
    this.onState?.()
  }

  zoomIn(): void {
    this.setZoom(this.zoomFactor + 0.1)
  }

  zoomOut(): void {
    this.setZoom(this.zoomFactor - 0.1)
  }

  zoomReset(): void {
    this.setZoom(1)
  }

  getLayout(): AppRailLayout {
    return this.railLayout
  }

  setLayout(layout: AppRailLayout): void {
    this.railLayout = layout
    for (const ws of this.allWindows()) {
      this.layout(ws)
      if (!ws.win.isDestroyed()) ws.win.webContents.send('layout:changed', layout)
    }
    this.onState?.()
  }

  getBookmarksBarVisible(): boolean {
    return this.bookmarksBar
  }

  setBookmarksBarVisible(visible: boolean): void {
    this.bookmarksBar = visible
    for (const ws of this.allWindows()) {
      this.layout(ws)
      if (!ws.win.isDestroyed()) ws.win.webContents.send('bookmarks:visible', visible)
    }
    this.onState?.()
  }

  // ---- bookmarks (metadata; folders open per-window) --------------------

  getBookmarks(accountId: string): BookmarkNode[] {
    return this.accounts.get(accountId)?.bookmarks ?? []
  }

  openBookmark(win: BrowserWindow, accountId: string, url: string): void {
    const ws = this.wsFor(win)
    if (!ws) return
    const tab = this.openTab(ws, accountId, url)
    this.accountState(ws, accountId).activeTabId = tab.id
    this.afterTabChange(ws, accountId)
  }

  openBookmarkFolder(win: BrowserWindow, accountId: string, folderId: string): void {
    const meta = this.accounts.get(accountId)
    if (!meta) return
    const folder = findFolder(meta.bookmarks, folderId)
    if (!folder) return
    Menu.buildFromTemplate(this.bookmarkMenu(win, accountId, folder.children)).popup({ window: win })
  }

  /** Popup menu for bookmark-bar items that don't fit (the "More" » button). */
  openBookmarksOverflow(win: BrowserWindow, accountId: string, ids: string[]): void {
    const meta = this.accounts.get(accountId)
    if (!meta) return
    const nodes = meta.bookmarks.filter((n) => ids.includes(n.id))
    if (nodes.length === 0) return
    Menu.buildFromTemplate(this.bookmarkMenu(win, accountId, nodes)).popup({ window: win })
  }

  private bookmarkMenu(
    win: BrowserWindow,
    accountId: string,
    nodes: BookmarkNode[]
  ): MenuItemConstructorOptions[] {
    if (nodes.length === 0) return [{ label: '(empty)', enabled: false }]
    return nodes.map((node) =>
      node.type === 'folder'
        ? { label: node.title || 'Folder', submenu: this.bookmarkMenu(win, accountId, node.children) }
        : { label: node.title || node.url, click: () => this.openBookmark(win, accountId, node.url) }
    )
  }

  getChromeProfiles(): ChromeProfile[] {
    try {
      return listChromeProfiles()
    } catch {
      return []
    }
  }

  importChromeBookmarks(accountId: string, chromeDir: string): void {
    const meta = this.accounts.get(accountId)
    if (!meta) return
    try {
      meta.bookmarks = readChromeBookmarkBar(chromeDir)
    } catch {
      return
    }
    this.broadcastBookmarks(accountId)
    this.onState?.()
  }

  // ---- navigation (per window, acts on active tab) ----------------------

  private activeTab(ws: WindowState): Tab | undefined {
    if (!ws.activeAccountId) return undefined
    const wa = ws.perAccount.get(ws.activeAccountId)
    if (!wa?.activeTabId) return undefined
    return wa.tabs.find((t) => t.id === wa.activeTabId)
  }

  private activeWc(win: BrowserWindow): WebContents | undefined {
    const ws = this.wsFor(win)
    return ws ? this.activeTab(ws)?.view?.webContents : undefined
  }

  goBack(win: BrowserWindow): void {
    const wc = this.activeWc(win)
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  }

  goForward(win: BrowserWindow): void {
    const wc = this.activeWc(win)
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  }

  reload(win: BrowserWindow): void {
    this.activeWc(win)?.reload()
  }

  navigate(win: BrowserWindow, input: string): void {
    const target = resolveQuery(input)
    if (target) void this.activeWc(win)?.loadURL(target)
  }

  getActiveNavState(win: BrowserWindow): NavState | null {
    const ws = this.wsFor(win)
    if (!ws || !ws.activeAccountId) return null
    const tab = this.activeTab(ws)
    if (!tab || !tab.view) return null
    const wc = tab.view.webContents
    return {
      accountId: ws.activeAccountId,
      tabId: tab.id,
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      title: wc.getTitle()
    }
  }

  // ---- per-window state queries (for renderer fetch on mount) -----------

  getTabs(win: BrowserWindow, accountId: string): TabInfo[] {
    const ws = this.wsFor(win)
    if (!ws) return []
    const wa = ws.perAccount.get(accountId)
    if (!wa) return []
    return wa.tabs
      .filter((t) => !t.originShortcutId)
      .map((t) => ({
        id: t.id,
        title: t.title || hostOf(t.currentUrl) || 'New tab',
        active: t.id === wa.activeTabId,
        favicon: t.favicon,
        shortcutId: t.originShortcutId
      }))
  }

  getApps(win: BrowserWindow, accountId: string): { apps: AppInfo[]; activeShortcutId?: string } {
    const meta = this.accounts.get(accountId)
    const ws = this.wsFor(win)
    if (!meta || !ws) return { apps: [] }
    const wa = ws.perAccount.get(accountId)
    const activeTab = wa?.tabs.find((t) => t.id === wa.activeTabId)
    const apps: AppInfo[] = meta.shortcuts.map((s) => ({
      id: s.id,
      label: s.label,
      favicon: s.favicon,
      unread: wa?.unreadByApp[s.id] ?? 0
    }))
    return { apps, activeShortcutId: activeTab?.originShortcutId }
  }

  summaries(): AccountSummary[] {
    return this.order.map((id) => {
      const meta = this.accounts.get(id)!
      return { id: meta.id, label: meta.label, color: meta.color, avatarUrl: meta.avatarUrl }
    })
  }

  unreadAll(win: BrowserWindow): Record<string, number> {
    const ws = this.wsFor(win)
    const out: Record<string, number> = {}
    for (const id of this.order) out[id] = ws ? this.totalUnread(ws, id) : 0
    return out
  }

  private totalUnread(ws: WindowState, accountId: string): number {
    const wa = ws.perAccount.get(accountId)
    if (!wa) return 0
    return Object.values(wa.unreadByApp).reduce((a, b) => a + b, 0)
  }

  // ---- shortcuts (metadata; broadcast) ----------------------------------

  shortcutsFor(id: string): Shortcut[] {
    return this.accounts.get(id)?.shortcuts ?? []
  }

  addShortcut(id: string, input: ShortcutInput): void {
    const meta = this.accounts.get(id)
    if (!meta) return
    meta.shortcuts.push({
      id: randomUUID(),
      label: input.label.trim() || 'Shortcut',
      url: normalizeUrl(input.url) || input.url
    })
    this.broadcastShortcuts(id)
    this.broadcastApps(id)
    this.onState?.()
  }

  updateShortcut(id: string, shortcutId: string, patch: ShortcutPatch): void {
    const shortcut = this.accounts.get(id)?.shortcuts.find((s) => s.id === shortcutId)
    if (!shortcut) return
    if (patch.label !== undefined) shortcut.label = patch.label.trim() || shortcut.label
    if (patch.url !== undefined) shortcut.url = normalizeUrl(patch.url) || shortcut.url
    this.broadcastShortcuts(id)
    this.broadcastApps(id)
    this.onState?.()
  }

  reorderShortcuts(accountId: string, shortcutIds: string[]): void {
    const meta = this.accounts.get(accountId)
    if (!meta) return
    const byId = new Map(meta.shortcuts.map((s) => [s.id, s]))
    const next: Shortcut[] = []
    for (const id of shortcutIds) {
      const shortcut = byId.get(id)
      if (shortcut) next.push(shortcut)
    }
    for (const shortcut of meta.shortcuts) {
      if (!shortcutIds.includes(shortcut.id)) next.push(shortcut)
    }
    if (next.length !== meta.shortcuts.length) return
    meta.shortcuts = next
    this.broadcastShortcuts(accountId)
    this.broadcastApps(accountId)
    this.onState?.()
  }

  removeShortcut(id: string, shortcutId: string): void {
    const meta = this.accounts.get(id)
    if (!meta) return
    meta.shortcuts = meta.shortcuts.filter((s) => s.id !== shortcutId)
    for (const ws of this.allWindows()) {
      const wa = ws.perAccount.get(id)
      if (wa) delete wa.unreadByApp[shortcutId]
    }
    this.broadcastShortcuts(id)
    this.broadcastApps(id)
    for (const ws of this.allWindows()) this.emitUnread(ws, id)
    this.onState?.()
  }

  // ---- context menus (per window) ---------------------------------------

  popupAccountMenu(win: BrowserWindow, accountId: string): void {
    if (!this.accounts.has(accountId)) return
    Menu.buildFromTemplate([
      { label: 'Edit', click: () => win.webContents.send('menu:edit-account', accountId) },
      { type: 'separator' },
      { label: 'Remove', click: () => void this.removeAccount(accountId) }
    ]).popup({ window: win })
  }

  popupShortcutMenu(win: BrowserWindow, accountId: string, shortcutId: string): void {
    const ws = this.wsFor(win)
    const openTab = ws?.perAccount.get(accountId)?.tabs.find((t) => t.originShortcutId === shortcutId)
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        click: () => win.webContents.send('menu:edit-shortcut', { accountId, shortcutId })
      },
      {
        label: 'Close',
        enabled: Boolean(openTab),
        click: () => openTab && this.closeTab(win, accountId, openTab.id)
      },
      { type: 'separator' },
      { label: 'Remove', click: () => this.removeShortcut(accountId, shortcutId) }
    ]).popup({ window: win })
  }

  // ---- avatar (metadata; broadcast) -------------------------------------

  private extractAvatar(accountId: string, wc: WebContents): void {
    wc.executeJavaScript(AVATAR_SCRIPT, true)
      .then((url: unknown) => {
        const meta = this.accounts.get(accountId)
        if (meta && typeof url === 'string' && url && url !== meta.avatarUrl) {
          meta.avatarUrl = url
          this.broadcastUpdated()
          this.onState?.()
        }
      })
      .catch(() => {
        // not ready / not a Google page
      })
  }

  // ---- persistence ------------------------------------------------------

  partitions(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const id of this.order) out[id] = partitionFor(id)
    return out
  }

  snapshotAccounts(): PersistedAccount[] {
    return this.order.map((id, index) => {
      const meta = this.accounts.get(id)!
      return {
        id: meta.id,
        label: meta.label,
        color: meta.color,
        homeUrl: meta.homeUrl,
        lastUrl: meta.lastUrl,
        order: index,
        shortcuts: meta.shortcuts,
        avatarUrl: meta.avatarUrl,
        bookmarks: meta.bookmarks
      }
    })
  }

  /** Active account of the first window, persisted as the default for relaunch. */
  defaultActiveId(): string | undefined {
    return this.allWindows()[0]?.activeAccountId ?? this.order[0]
  }

  // ---- layout / visibility (per window) ---------------------------------

  private contentLeft(): number {
    return SIDEBAR_WIDTH + (this.railLayout === 'left' ? APP_RAIL_WIDTH : 0)
  }

  private topChrome(): number {
    return TITLE_BAR_HEIGHT + TOP_BAR_HEIGHT + (this.bookmarksBar ? BOOKMARKS_BAR_HEIGHT : 0)
  }

  private refreshVisibility(ws: WindowState): void {
    this.materializeActive(ws)
    for (const [accountId, wa] of ws.perAccount) {
      for (const tab of wa.tabs) {
        if (!tab.view) continue // discarded → already not visible
        const visible =
          accountId === ws.activeAccountId && tab.id === wa.activeTabId && !ws.overlayOpen
        tab.view.setVisible(visible)
      }
    }
  }

  private layout(ws: WindowState): void {
    if (ws.win.isDestroyed()) return
    const [width, height] = ws.win.getContentSize()
    const tab = this.activeTab(ws)
    if (!tab || !tab.view) return
    const left = this.contentLeft()
    const top = this.topChrome()
    tab.view.setBounds({
      x: left,
      y: top,
      width: Math.max(0, width - left),
      height: Math.max(0, height - top)
    })
  }

  // ---- emit to a single window's renderer -------------------------------

  private emitNav(ws: WindowState): void {
    if (!ws.win.isDestroyed()) ws.win.webContents.send('nav:state', this.getActiveNavState(ws.win))
  }

  private emitTabs(ws: WindowState, accountId: string): void {
    if (!ws.win.isDestroyed()) {
      ws.win.webContents.send('tabs:state', {
        accountId,
        tabs: this.getTabs(ws.win, accountId)
      })
    }
  }

  private emitApps(ws: WindowState, accountId: string): void {
    if (ws.win.isDestroyed()) return
    const { apps, activeShortcutId } = this.getApps(ws.win, accountId)
    ws.win.webContents.send('apps:state', { accountId, apps, activeShortcutId })
  }

  private emitUnread(ws: WindowState, accountId: string): void {
    if (!ws.win.isDestroyed()) {
      ws.win.webContents.send('accounts:unread', { id: accountId, count: this.totalUnread(ws, accountId) })
    }
  }

  // ---- broadcast metadata changes to every window -----------------------

  private broadcastUpdated(): void {
    const summaries = this.summaries()
    for (const ws of this.allWindows()) {
      if (!ws.win.isDestroyed()) ws.win.webContents.send('accounts:updated', summaries)
    }
  }

  private broadcastShortcuts(accountId: string): void {
    const shortcuts = this.shortcutsFor(accountId)
    for (const ws of this.allWindows()) {
      if (!ws.win.isDestroyed()) {
        ws.win.webContents.send('shortcuts:updated', { accountId, shortcuts })
      }
    }
  }

  private broadcastApps(accountId: string): void {
    for (const ws of this.allWindows()) this.emitApps(ws, accountId)
  }

  private broadcastBookmarks(accountId: string): void {
    const meta = this.accounts.get(accountId)
    if (!meta) return
    for (const ws of this.allWindows()) {
      if (!ws.win.isDestroyed()) {
        ws.win.webContents.send('bookmarks:state', { accountId, bookmarks: meta.bookmarks })
      }
    }
  }
}
