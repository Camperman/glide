import { BrowserWindow, Menu, WebContents, WebContentsView, session } from 'electron'
import { randomUUID } from 'crypto'
import type {
  AccountPatch,
  AccountSummary,
  NavState,
  NewAccountInput,
  Shortcut,
  ShortcutInput,
  ShortcutPatch
} from '../shared/types'
import type { PersistedAccount } from './persistence'

export const SIDEBAR_WIDTH = 64
// Heights of the renderer's chrome strips, top to bottom: a draggable title
// bar, the nav/address toolbar, then the shortcuts/tab bar. The renderer
// reserves the same strips in CSS (.titlebar, .topbar, .shortcuts); keep in sync.
export const TITLE_BAR_HEIGHT = 30
export const TOP_BAR_HEIGHT = 44
export const SHORTCUTS_BAR_HEIGHT = 40
const TOP_CHROME_HEIGHT = TITLE_BAR_HEIGHT + TOP_BAR_HEIGHT + SHORTCUTS_BAR_HEIGHT

/** The Google services seeded into every new profile's shortcuts bar. */
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
  activeShortcutId?: string
}

/** One live page within an account. Keyed by the shortcut that opened it. */
interface Tab {
  shortcutId: string
  view: WebContentsView
  currentUrl: string
}

/**
 * An account: its config, its shortcut list (the tab definitions), and the
 * set of currently-open tabs (lazy — created on first open, kept alive until
 * closed). All tabs of an account share its session partition, so every
 * service stays logged into the same Google account.
 */
interface ManagedAccount {
  config: AccountConfig
  shortcuts: Shortcut[]
  tabs: Map<string, Tab>
  activeShortcutId?: string
  unread: number
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
 * so cookies and login never bleed across accounts. Within an account, each
 * shortcut can open its own persistent tab (a WebContentsView) so switching
 * between services (Mail ↔ Calendar) is instant and never reloads. Account
 * content is untrusted remote Google pages: no preload, no node integration,
 * context isolation on. `onState` fires whenever something persistable changes.
 */
export class AccountManager {
  private readonly win: BrowserWindow
  private readonly onState?: () => void
  private readonly accounts = new Map<string, ManagedAccount>()
  private order: string[] = []
  private activeId?: string
  // When a DOM modal is open the renderer asks us to hide the active web view,
  // since a native WebContentsView always paints above the HTML UI.
  private overlayOpen = false

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

    const part = partitionFor(config.id)
    // Configure the shared session for this account once.
    const ses = session.fromPartition(part)
    ses.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(GRANTED_PERMISSIONS.has(permission))
    )
    ses.setPermissionCheckHandler((_wc, permission) => GRANTED_PERMISSIONS.has(permission))

    const shortcuts =
      config.shortcuts && config.shortcuts.length > 0 ? config.shortcuts : defaultShortcuts()
    const account: ManagedAccount = {
      config,
      shortcuts,
      tabs: new Map(),
      unread: 0,
      avatarUrl: config.avatarUrl
    }
    this.accounts.set(config.id, account)
    this.order.push(config.id)

    // Open the initial tab: the previously-active shortcut, else the one whose
    // host matches the restored URL, else the first shortcut. Restore lastUrl
    // into it when it belongs to that service.
    const restoreUrl = config.lastUrl ?? config.homeUrl
    const initial =
      (config.activeShortcutId && shortcuts.find((s) => s.id === config.activeShortcutId)) ||
      shortcuts.find((s) => hostOf(s.url) === hostOf(restoreUrl)) ||
      shortcuts[0]
    if (initial) {
      const url = hostOf(restoreUrl) === hostOf(initial.url) ? restoreUrl : initial.url
      this.openTab(account, initial.id, url)
      account.activeShortcutId = initial.id
    }

    if (!this.activeId) this.setActive(config.id)
    this.refreshVisibility()
    this.layout()
  }

  /** Create a live tab view for a shortcut and load it. Does not activate it. */
  private openTab(account: ManagedAccount, shortcutId: string, url: string): Tab {
    const part = partitionFor(account.config.id)
    const view = new WebContentsView({
      webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false }
    })
    view.setBackgroundColor('#ffffff')
    const wc = view.webContents
    const tab: Tab = { shortcutId, view, currentUrl: url }

    const isActiveTab = (): boolean =>
      this.activeId === account.config.id && account.activeShortcutId === shortcutId

    wc.on('did-finish-load', () => {
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
      // Unread comes from the Gmail tab's title; track it per account.
      if (hostOf(wc.getURL()).includes('mail.google.com')) {
        const count = parseUnread(title)
        if (count !== account.unread) {
          account.unread = count
          this.emitUnread(account.config.id, count)
        }
      }
      if (isActiveTab()) this.emitNav()
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

    account.tabs.set(shortcutId, tab)
    return tab
  }

  /** Open (or focus, without reloading) the tab for a shortcut in an account. */
  openShortcut(accountId: string, shortcutId: string): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    const shortcut = account.shortcuts.find((s) => s.id === shortcutId)
    if (!shortcut) return

    if (!account.tabs.has(shortcutId)) this.openTab(account, shortcutId, shortcut.url)
    account.activeShortcutId = shortcutId

    if (accountId === this.activeId) {
      this.refreshVisibility()
      this.layout()
      this.emitNav()
    }
    this.emitTabs(account)
    this.onState?.()
  }

  /** Close (unload) a tab to reclaim memory; reopening reloads it fresh. */
  closeTab(accountId: string, shortcutId: string): void {
    const account = this.accounts.get(accountId)
    const tab = account?.tabs.get(shortcutId)
    if (!account || !tab) return

    this.destroyTab(tab)
    account.tabs.delete(shortcutId)
    if (account.activeShortcutId === shortcutId) {
      account.activeShortcutId = account.tabs.keys().next().value
    }

    if (accountId === this.activeId) {
      this.refreshVisibility()
      this.layout()
      this.emitNav()
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

  /** Add a brand-new account (UI-driven), make it active, and persist. */
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

    for (const tab of account.tabs.values()) this.destroyTab(tab)
    account.tabs.clear()
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

  /** Show only the active account's active tab; keep all others alive but hidden. */
  private refreshVisibility(): void {
    for (const [accountId, account] of this.accounts) {
      for (const [shortcutId, tab] of account.tabs) {
        const visible =
          accountId === this.activeId &&
          shortcutId === account.activeShortcutId &&
          !this.overlayOpen
        tab.view.setVisible(visible)
      }
    }
  }

  private activeTab(): Tab | undefined {
    const account = this.activeId ? this.accounts.get(this.activeId) : undefined
    if (!account?.activeShortcutId) return undefined
    return account.tabs.get(account.activeShortcutId)
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

  navigate(url: string): void {
    const target = normalizeUrl(url)
    if (target) void this.activeWebContents()?.loadURL(target)
  }

  getActiveNavState(): NavState | null {
    const account = this.activeId ? this.accounts.get(this.activeId) : undefined
    const tab = this.activeTab()
    if (!account || !tab) return null
    const wc = tab.view.webContents
    return {
      accountId: account.config.id,
      tabId: tab.shortcutId,
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      title: wc.getTitle()
    }
  }

  private emitNav(): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('nav:state', this.getActiveNavState())
  }

  /** Open tabs + active tab for an account (for the renderer's tab strip). */
  getTabs(accountId: string): { open: string[]; active?: string } {
    const account = this.accounts.get(accountId)
    if (!account) return { open: [] }
    return { open: [...account.tabs.keys()], active: account.activeShortcutId }
  }

  private emitTabs(account: ManagedAccount): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('tabs:state', {
        accountId: account.config.id,
        open: [...account.tabs.keys()],
        active: account.activeShortcutId
      })
    }
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
    const isOpen = account?.tabs.has(shortcutId) ?? false
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        click: () => this.win.webContents.send('menu:edit-shortcut', { accountId, shortcutId })
      },
      { label: 'Close tab', enabled: isOpen, click: () => this.closeTab(accountId, shortcutId) },
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

  /** Map of account id → session partition string (test/diagnostic use). */
  partitions(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const id of this.order) out[id] = partitionFor(id)
    return out
  }

  snapshotAccounts(): PersistedAccount[] {
    return this.order.map((id, index) => {
      const account = this.accounts.get(id)!
      const activeTab = account.activeShortcutId
        ? account.tabs.get(account.activeShortcutId)
        : undefined
      return {
        id: account.config.id,
        label: account.config.label,
        color: account.config.color,
        homeUrl: account.config.homeUrl,
        lastUrl: activeTab?.currentUrl ?? account.config.lastUrl,
        order: index,
        shortcuts: account.shortcuts,
        avatarUrl: account.avatarUrl,
        activeShortcutId: account.activeShortcutId
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
    this.onState?.()
  }

  updateShortcut(id: string, shortcutId: string, patch: ShortcutPatch): void {
    const shortcut = this.accounts.get(id)?.shortcuts.find((s) => s.id === shortcutId)
    if (!shortcut) return
    if (patch.label !== undefined) shortcut.label = patch.label.trim() || shortcut.label
    if (patch.url !== undefined) shortcut.url = normalizeUrl(patch.url) || shortcut.url
    this.emitShortcuts(id)
    this.onState?.()
  }

  removeShortcut(id: string, shortcutId: string): void {
    const account = this.accounts.get(id)
    if (!account) return
    // Closing its tab first frees the view and fixes up the active tab.
    if (account.tabs.has(shortcutId)) this.closeTab(id, shortcutId)
    account.shortcuts = account.shortcuts.filter((s) => s.id !== shortcutId)
    this.emitShortcuts(id)
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

  private emitUnread(id: string, count: number): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('accounts:unread', { id, count })
    }
  }

  unreadAll(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const id of this.order) out[id] = this.accounts.get(id)!.unread
    return out
  }

  /** Position the active account's active tab in the area right of the sidebar. */
  private layout(): void {
    const [width, height] = this.win.getContentSize()
    const tab = this.activeTab()
    if (!tab) return
    tab.view.setBounds({
      x: SIDEBAR_WIDTH,
      y: TOP_CHROME_HEIGHT,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height: Math.max(0, height - TOP_CHROME_HEIGHT)
    })
  }
}
