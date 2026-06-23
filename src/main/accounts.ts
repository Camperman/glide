import { BrowserWindow, Menu, WebContents, WebContentsView, session } from 'electron'
import { randomUUID } from 'crypto'
import type {
  AccountPatch,
  AccountSummary,
  AppInfo,
  AppRailLayout,
  NavState,
  NewAccountInput,
  Shortcut,
  ShortcutInput,
  ShortcutPatch,
  TabInfo
} from '../shared/types'
import type { PersistedAccount } from './persistence'

// The profile avatars, then (in 'left' layout) the vertical app rail. Content
// starts to the right. The renderer reserves the matching widths/heights in CSS
// (.sidebar, .apprail, .titlebar, .topbar); keep these in sync.
export const SIDEBAR_WIDTH = 64
export const APP_RAIL_WIDTH = 84
export const TITLE_BAR_HEIGHT = 38
export const TOP_BAR_HEIGHT = 44
const TOP_CHROME_HEIGHT = TITLE_BAR_HEIGHT + TOP_BAR_HEIGHT

const NEW_TAB_URL = 'https://www.google.com'

/** The Google services seeded into every new profile's bookmarks bar. */
function defaultShortcuts(): Shortcut[] {
  return [
    { label: 'Mail', url: 'https://mail.google.com' },
    { label: 'Calendar', url: 'https://calendar.google.com' },
    { label: 'Drive', url: 'https://drive.google.com' },
    { label: 'Docs', url: 'https://docs.google.com' },
    { label: 'Sheets', url: 'https://sheets.google.com' },
    { label: 'Meet', url: 'https://meet.google.com' },
    { label: 'Contacts', url: 'https://contacts.google.com' }
  ].map((s) => ({ id: randomUUID(), ...s }))
}

// Permissions granted to account sessions. Notifications is the headline one;
// media covers Google Meet camera/mic. Everything else is denied.
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
}

/** One open browser tab within an account. */
interface Tab {
  id: string
  view: WebContentsView
  currentUrl: string
  title: string
  favicon?: string
  /** Set when the tab was opened from an app, so that app focuses it. */
  originShortcutId?: string
}

interface ManagedAccount {
  config: AccountConfig
  shortcuts: Shortcut[]
  tabs: Tab[]
  activeTabId?: string
  /** Unread count per app (shortcut id), parsed from each app tab's title. */
  unreadByApp: Record<string, number>
  avatarUrl?: string
}

// Read-only snippet run in the logged-in Google page to find the account photo.
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

/** Ensure a user-entered URL has a scheme; blank stays blank (caller defaults). */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/**
 * Resolve an address-bar entry the way a browser omnibox does: navigate to it
 * if it looks like a URL/domain, otherwise run a Google search.
 */
export function resolveQuery(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  // Explicit scheme (http://, https://, etc.) → use as-is.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  const looksLikeUrl =
    !/\s/.test(trimmed) &&
    (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) ||
      /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(trimmed) || // IPv4
      /^[^\s/.]+\.[^\s/.]+/.test(trimmed)) // host.tld, no spaces
  if (looksLikeUrl) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

/** Extract an unread count from a page title, e.g. "Inbox (12) - … - Gmail" → 12. */
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

/**
 * Owns the lifecycle, layout, and switching of per-account web views. Each
 * account runs in its own persistent session partition (`persist:account-<id>`)
 * so cookies and login never bleed across accounts. Within an account you can
 * open multiple tabs (each a WebContentsView, all sharing the account session);
 * tabs stay live until closed. Account content is untrusted remote pages: no
 * preload, no node integration, context isolation on. `onState` fires whenever
 * something persistable changes.
 */
export class AccountManager {
  private readonly win: BrowserWindow
  private readonly onState?: () => void
  private readonly accounts = new Map<string, ManagedAccount>()
  private order: string[] = []
  private activeId?: string
  private overlayOpen = false
  // App-wide page zoom, applied to every tab and persisted across restarts.
  private zoomFactor = 1
  // Where the app rail sits ('left' reserves a left column; 'top' does not).
  private railLayout: AppRailLayout = 'left'

  constructor(win: BrowserWindow, onState?: () => void) {
    this.win = win
    this.onState = onState
    this.win.on('resize', () => this.layout())
  }

  load(configs: AccountConfig[]): void {
    for (const config of configs) this.createAccount(config)
  }

  createAccount(config: AccountConfig): void {
    if (this.accounts.has(config.id)) return

    const ses = session.fromPartition(partitionFor(config.id))
    ses.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(GRANTED_PERMISSIONS.has(permission))
    )
    ses.setPermissionCheckHandler((_wc, permission) => GRANTED_PERMISSIONS.has(permission))

    const shortcuts =
      config.shortcuts && config.shortcuts.length > 0 ? config.shortcuts : defaultShortcuts()
    const account: ManagedAccount = {
      config,
      shortcuts,
      tabs: [],
      unreadByApp: {},
      avatarUrl: config.avatarUrl
    }
    this.accounts.set(config.id, account)
    this.order.push(config.id)

    // Open one initial tab restoring the last URL; tag it to a matching bookmark
    // so that bookmark focuses it rather than opening a duplicate.
    const restoreUrl = config.lastUrl ?? config.homeUrl
    const origin = shortcuts.find((s) => hostOf(s.url) === hostOf(restoreUrl))?.id
    const tab = this.openTab(account, restoreUrl, origin)
    account.activeTabId = tab.id

    if (!this.activeId) this.setActive(config.id)
    this.refreshVisibility()
    this.layout()
  }

  private openTab(account: ManagedAccount, url: string, originShortcutId?: string): Tab {
    const part = partitionFor(account.config.id)
    const view = new WebContentsView({
      webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false }
    })
    view.setBackgroundColor('#ffffff')
    const wc = view.webContents
    const tab: Tab = { id: randomUUID(), view, currentUrl: url, title: '', originShortcutId }

    const isActiveTab = (): boolean =>
      this.activeId === account.config.id && account.activeTabId === tab.id

    wc.on('did-finish-load', () => {
      wc.setZoomFactor(this.zoomFactor)
      this.extractAvatar(account, wc)
      setTimeout(() => this.extractAvatar(account, wc), 2000)
    })

    const onNav = (): void => {
      tab.currentUrl = wc.getURL()
      this.onState?.()
      if (isActiveTab()) this.emitNav()
    }
    wc.on('did-navigate', onNav)
    wc.on('did-navigate-in-page', (_e, _u, isMainFrame) => {
      if (isMainFrame) onNav()
    })
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      // Per-app unread: attribute the title's "(N)" to the app this tab belongs to.
      if (tab.originShortcutId) {
        const count = parseUnread(title)
        if (account.unreadByApp[tab.originShortcutId] !== count) {
          account.unreadByApp[tab.originShortcutId] = count
          this.emitUnread(account.config.id)
          if (this.activeId === account.config.id) this.emitApps(account)
        }
      }
      if (this.activeId === account.config.id) this.emitTabs(account)
      if (isActiveTab()) this.emitNav()
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      const icon = favicons[0]
      if (!icon || icon === tab.favicon) return
      tab.favicon = icon
      // Cache it on the originating app so the rail shows it even before reload.
      if (tab.originShortcutId) {
        const shortcut = account.shortcuts.find((s) => s.id === tab.originShortcutId)
        if (shortcut && shortcut.favicon !== icon) {
          shortcut.favicon = icon
          this.onState?.()
        }
      }
      if (this.activeId === account.config.id) {
        this.emitTabs(account)
        this.emitApps(account)
      }
    })

    // Keep popups (auth, "open in new window") in the same account session.
    wc.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false }
      }
    }))

    view.setVisible(false)
    this.win.contentView.addChildView(view)
    void wc.loadURL(url)

    account.tabs.push(tab)
    return tab
  }

  /** Open a brand-new tab (the + button / Cmd-T) and focus it. */
  newTab(accountId: string): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    const tab = this.openTab(account, NEW_TAB_URL)
    account.activeTabId = tab.id
    this.afterTabChange(accountId, account)
  }

  /** Focus an existing tab by id. */
  activateTab(accountId: string, tabId: string): void {
    const account = this.accounts.get(accountId)
    if (!account || !account.tabs.some((t) => t.id === tabId)) return
    account.activeTabId = tabId
    this.afterTabChange(accountId, account)
  }

  /** Reorder an account's tabs to match the given id order (drag-and-drop). */
  reorderTabs(accountId: string, tabIds: string[]): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    const byId = new Map(account.tabs.map((t) => [t.id, t]))
    const next: Tab[] = []
    for (const id of tabIds) {
      const tab = byId.get(id)
      if (tab) next.push(tab)
    }
    // Keep any tabs not named in the new order (safety) at the end.
    for (const tab of account.tabs) if (!tabIds.includes(tab.id)) next.push(tab)
    if (next.length !== account.tabs.length) return
    account.tabs = next
    this.emitTabs(account)
  }

  /** Close (unload) a tab; activate a neighbour if it was active. */
  closeTab(accountId: string, tabId: string): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    const index = account.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return

    this.destroyTab(account.tabs[index])
    account.tabs.splice(index, 1)
    if (account.activeTabId === tabId) {
      const neighbour = account.tabs[index] ?? account.tabs[index - 1]
      account.activeTabId = neighbour?.id
    }
    this.afterTabChange(accountId, account)
  }

  /** Bookmark click: focus the tab opened from it, else open a new one. */
  openShortcut(accountId: string, shortcutId: string): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    const shortcut = account.shortcuts.find((s) => s.id === shortcutId)
    if (!shortcut) return
    const existing = account.tabs.find((t) => t.originShortcutId === shortcutId)
    if (existing) {
      account.activeTabId = existing.id
    } else {
      const tab = this.openTab(account, shortcut.url, shortcutId)
      account.activeTabId = tab.id
    }
    this.afterTabChange(accountId, account)
  }

  private afterTabChange(accountId: string, account: ManagedAccount): void {
    if (accountId === this.activeId) {
      this.refreshVisibility()
      this.layout()
      this.emitNav()
      this.emitApps(account)
    }
    this.emitTabs(account)
    this.onState?.()
  }

  private destroyTab(tab: Tab): void {
    this.win.contentView.removeChildView(tab.view)
    try {
      ;(tab.view.webContents as unknown as { destroy?: () => void }).destroy?.()
    } catch {
      // already gone
    }
  }

  addAccount(input: NewAccountInput): string {
    const id = randomUUID()
    this.createAccount({
      id,
      label: input.label.trim() || 'Account',
      color: input.color || '#888888',
      homeUrl: normalizeUrl(input.homeUrl) || 'https://mail.google.com'
    })
    this.setActive(id)
    this.emitUpdated()
    this.onState?.()
    return id
  }

  updateAccount(id: string, patch: AccountPatch): void {
    const account = this.accounts.get(id)
    if (!account) return
    if (patch.label !== undefined) account.config.label = patch.label.trim() || account.config.label
    if (patch.color !== undefined) account.config.color = patch.color
    this.emitUpdated()
    this.onState?.()
  }

  async removeAccount(id: string): Promise<void> {
    const account = this.accounts.get(id)
    if (!account) return
    for (const tab of account.tabs) this.destroyTab(tab)
    account.tabs = []
    this.accounts.delete(id)
    this.order = this.order.filter((x) => x !== id)

    try {
      await session.fromPartition(partitionFor(id)).clearStorageData()
    } catch {
      // best-effort wipe
    }

    if (this.activeId === id) {
      this.activeId = undefined
      const next = this.order[0]
      if (next) this.setActive(next)
    }
    this.emitUpdated()
    this.onState?.()
  }

  setActive(id: string): void {
    if (!this.accounts.has(id)) return
    this.activeId = id
    this.refreshVisibility()
    this.layout()
    if (!this.win.isDestroyed()) this.win.webContents.send('accounts:active-changed', id)
    this.emitNav()
    this.emitTabs(this.accounts.get(id)!)
    this.emitApps(this.accounts.get(id)!)
    this.onState?.()
  }

  getActiveId(): string | undefined {
    return this.activeId
  }

  setActiveByIndex(index: number): void {
    const id = this.order[index]
    if (id) this.setActive(id)
  }

  setOverlayOpen(open: boolean): void {
    this.overlayOpen = open
    this.refreshVisibility()
  }

  getZoom(): number {
    return this.zoomFactor
  }

  /** Set app-wide page zoom (clamped 30%–300%) and apply to every open tab. */
  setZoom(factor: number): void {
    this.zoomFactor = Math.round(Math.min(3, Math.max(0.3, factor)) * 100) / 100
    for (const account of this.accounts.values()) {
      for (const tab of account.tabs) tab.view.webContents.setZoomFactor(this.zoomFactor)
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

  /** Move the app rail between the left column and the top-right icon row. */
  setLayout(layout: AppRailLayout): void {
    this.railLayout = layout
    this.layout()
    if (!this.win.isDestroyed()) this.win.webContents.send('layout:changed', layout)
    this.onState?.()
  }

  private contentLeft(): number {
    return SIDEBAR_WIDTH + (this.railLayout === 'left' ? APP_RAIL_WIDTH : 0)
  }

  /** Show only the active account's active tab; keep all others alive but hidden. */
  private refreshVisibility(): void {
    for (const [accountId, account] of this.accounts) {
      for (const tab of account.tabs) {
        const visible =
          accountId === this.activeId && tab.id === account.activeTabId && !this.overlayOpen
        tab.view.setVisible(visible)
      }
    }
  }

  private activeTab(): Tab | undefined {
    const account = this.activeId ? this.accounts.get(this.activeId) : undefined
    if (!account?.activeTabId) return undefined
    return account.tabs.find((t) => t.id === account.activeTabId)
  }

  private activeWebContents(): WebContents | undefined {
    return this.activeTab()?.view.webContents
  }

  goBack(): void {
    const wc = this.activeWebContents()
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  }

  goForward(): void {
    const wc = this.activeWebContents()
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  }

  reload(): void {
    this.activeWebContents()?.reload()
  }

  navigate(input: string): void {
    const target = resolveQuery(input)
    if (target) void this.activeWebContents()?.loadURL(target)
  }

  getActiveNavState(): NavState | null {
    const account = this.activeId ? this.accounts.get(this.activeId) : undefined
    const tab = this.activeTab()
    if (!account || !tab) return null
    const wc = tab.view.webContents
    return {
      accountId: account.config.id,
      tabId: tab.id,
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      title: wc.getTitle()
    }
  }

  private emitNav(): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('nav:state', this.getActiveNavState())
  }

  /**
   * Tabs shown in the tab strip: only ad-hoc tabs (pages opened via + or links).
   * App tabs are represented by the app rail instead, so they don't duplicate
   * into the strip.
   */
  getTabs(accountId: string): TabInfo[] {
    const account = this.accounts.get(accountId)
    if (!account) return []
    return account.tabs
      .filter((t) => !t.originShortcutId)
      .map((t) => ({
        id: t.id,
        title: t.title || hostOf(t.currentUrl) || 'New tab',
        active: t.id === account.activeTabId,
        favicon: t.favicon,
        shortcutId: t.originShortcutId
      }))
  }

  private emitTabs(account: ManagedAccount): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('tabs:state', {
        accountId: account.config.id,
        tabs: this.getTabs(account.config.id)
      })
    }
  }

  /** The app rail's view of an account: each app + its favicon + unread, plus
   *  which app the active tab belongs to. */
  getApps(accountId: string): { apps: AppInfo[]; activeShortcutId?: string } {
    const account = this.accounts.get(accountId)
    if (!account) return { apps: [] }
    const activeTab = account.tabs.find((t) => t.id === account.activeTabId)
    const apps: AppInfo[] = account.shortcuts.map((s) => ({
      id: s.id,
      label: s.label,
      favicon: s.favicon,
      unread: account.unreadByApp[s.id] ?? 0
    }))
    return { apps, activeShortcutId: activeTab?.originShortcutId }
  }

  private emitApps(account: ManagedAccount): void {
    if (this.win.isDestroyed()) return
    const { apps, activeShortcutId } = this.getApps(account.config.id)
    this.win.webContents.send('apps:state', { accountId: account.config.id, apps, activeShortcutId })
  }

  popupAccountMenu(accountId: string): void {
    if (!this.accounts.has(accountId)) return
    Menu.buildFromTemplate([
      { label: 'Edit', click: () => this.win.webContents.send('menu:edit-account', accountId) },
      { type: 'separator' },
      { label: 'Remove', click: () => void this.removeAccount(accountId) }
    ]).popup({ window: this.win })
  }

  popupShortcutMenu(accountId: string, shortcutId: string): void {
    const account = this.accounts.get(accountId)
    const openTab = account?.tabs.find((t) => t.originShortcutId === shortcutId)
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        click: () => this.win.webContents.send('menu:edit-shortcut', { accountId, shortcutId })
      },
      {
        label: 'Close',
        enabled: Boolean(openTab),
        click: () => openTab && this.closeTab(accountId, openTab.id)
      },
      { type: 'separator' },
      { label: 'Remove', click: () => this.removeShortcut(accountId, shortcutId) }
    ]).popup({ window: this.win })
  }

  summaries(): AccountSummary[] {
    return this.order.map((id) => {
      const account = this.accounts.get(id)!
      return {
        id: account.config.id,
        label: account.config.label,
        color: account.config.color,
        avatarUrl: account.avatarUrl
      }
    })
  }

  private extractAvatar(account: ManagedAccount, wc: WebContents): void {
    wc.executeJavaScript(AVATAR_SCRIPT, true)
      .then((url: unknown) => {
        if (typeof url === 'string' && url && url !== account.avatarUrl) {
          account.avatarUrl = url
          this.emitUpdated()
          this.onState?.()
        }
      })
      .catch(() => {
        // page not ready / not a Google page — ignore
      })
  }

  partitions(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const id of this.order) out[id] = partitionFor(id)
    return out
  }

  snapshotAccounts(): PersistedAccount[] {
    return this.order.map((id, index) => {
      const account = this.accounts.get(id)!
      const activeTab = account.tabs.find((t) => t.id === account.activeTabId)
      return {
        id: account.config.id,
        label: account.config.label,
        color: account.config.color,
        homeUrl: account.config.homeUrl,
        lastUrl: activeTab?.currentUrl ?? account.config.lastUrl,
        order: index,
        shortcuts: account.shortcuts,
        avatarUrl: account.avatarUrl
      }
    })
  }

  private emitUpdated(): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('accounts:updated', this.summaries())
    }
  }

  shortcutsFor(id: string): Shortcut[] {
    return this.accounts.get(id)?.shortcuts ?? []
  }

  addShortcut(id: string, input: ShortcutInput): void {
    const account = this.accounts.get(id)
    if (!account) return
    account.shortcuts.push({
      id: randomUUID(),
      label: input.label.trim() || 'Shortcut',
      url: normalizeUrl(input.url) || input.url
    })
    this.emitShortcuts(id)
    this.emitApps(account)
    this.onState?.()
  }

  updateShortcut(id: string, shortcutId: string, patch: ShortcutPatch): void {
    const shortcut = this.accounts.get(id)?.shortcuts.find((s) => s.id === shortcutId)
    if (!shortcut) return
    if (patch.label !== undefined) shortcut.label = patch.label.trim() || shortcut.label
    if (patch.url !== undefined) shortcut.url = normalizeUrl(patch.url) || shortcut.url
    this.emitShortcuts(id)
    this.emitApps(this.accounts.get(id)!)
    this.onState?.()
  }

  removeShortcut(id: string, shortcutId: string): void {
    const account = this.accounts.get(id)
    if (!account) return
    account.shortcuts = account.shortcuts.filter((s) => s.id !== shortcutId)
    delete account.unreadByApp[shortcutId]
    this.emitShortcuts(id)
    this.emitApps(account)
    this.emitUnread(id)
    this.onState?.()
  }

  private emitShortcuts(id: string): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('shortcuts:updated', {
        accountId: id,
        shortcuts: this.shortcutsFor(id)
      })
    }
  }

  private totalUnread(account: ManagedAccount): number {
    return Object.values(account.unreadByApp).reduce((a, b) => a + b, 0)
  }

  private emitUnread(id: string): void {
    const account = this.accounts.get(id)
    if (!account || this.win.isDestroyed()) return
    this.win.webContents.send('accounts:unread', { id, count: this.totalUnread(account) })
  }

  unreadAll(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const id of this.order) out[id] = this.totalUnread(this.accounts.get(id)!)
    return out
  }

  /** Position the active account's active tab in the area right of the sidebar. */
  private layout(): void {
    const [width, height] = this.win.getContentSize()
    const tab = this.activeTab()
    if (!tab) return
    const left = this.contentLeft()
    tab.view.setBounds({
      x: left,
      y: TOP_CHROME_HEIGHT,
      width: Math.max(0, width - left),
      height: Math.max(0, height - TOP_CHROME_HEIGHT)
    })
  }
}
