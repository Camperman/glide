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
// Heights of the renderer's two chrome strips (top bar + shortcuts bar). The
// renderer reserves the same strips in CSS (.topbar, .shortcuts); keep in sync.
export const TOP_BAR_HEIGHT = 44
export const SHORTCUTS_BAR_HEIGHT = 40
const TOP_CHROME_HEIGHT = TOP_BAR_HEIGHT + SHORTCUTS_BAR_HEIGHT

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
}

interface ManagedView {
  config: AccountConfig
  view: WebContentsView
  currentUrl: string
  unread: number
  shortcuts: Shortcut[]
}

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

/**
 * Owns the lifecycle, layout, and switching of per-account WebContentsViews.
 * Each account runs in its own persistent session partition
 * (`persist:account-<id>`) so cookies and login state never bleed across
 * accounts. Account content is untrusted remote Google pages: no preload,
 * no node integration, context isolation on.
 *
 * Tracks each account's current URL so the main process can persist a
 * `lastUrl` to restore on next launch. `onState` is invoked whenever something
 * persistable changes (active account, navigation); the caller debounces saves.
 */
export class AccountManager {
  private readonly win: BrowserWindow
  private readonly onState?: () => void
  private readonly views = new Map<string, ManagedView>()
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

  /** Edit an existing account's label/color. */
  updateAccount(id: string, patch: AccountPatch): void {
    const managed = this.views.get(id)
    if (!managed) return
    if (patch.label !== undefined) managed.config.label = patch.label.trim() || managed.config.label
    if (patch.color !== undefined) managed.config.color = patch.color
    this.emitUpdated()
    this.onState?.()
  }

  /**
   * Remove an account: destroy its view AND clear its partition's session data
   * so the account is truly gone (re-adding requires a fresh login).
   */
  async removeAccount(id: string): Promise<void> {
    const managed = this.views.get(id)
    if (!managed) return

    this.win.contentView.removeChildView(managed.view)
    try {
      ;(managed.view.webContents as unknown as { destroy?: () => void }).destroy?.()
    } catch {
      // already gone
    }
    this.views.delete(id)
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

  createAccount(config: AccountConfig): void {
    if (this.views.has(config.id)) return

    const part = partitionFor(config.id)
    const view = new WebContentsView({
      webPreferences: {
        partition: part,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    view.setBackgroundColor('#ffffff')

    // Allow the permissions Google web apps need (notably notifications, plus
    // camera/mic for Meet) per account session; deny exotic ones.
    const ses = session.fromPartition(part)
    ses.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(GRANTED_PERMISSIONS.has(permission))
    )
    ses.setPermissionCheckHandler((_wc, permission) => GRANTED_PERMISSIONS.has(permission))

    const startUrl = config.lastUrl ?? config.homeUrl
    const shortcuts =
      config.shortcuts && config.shortcuts.length > 0 ? config.shortcuts : defaultShortcuts()
    const managed: ManagedView = { config, view, currentUrl: startUrl, unread: 0, shortcuts }

    const onNavEvent = (): void => {
      managed.currentUrl = view.webContents.getURL()
      this.onState?.()
      if (this.activeId === config.id) this.emitNav()
    }
    view.webContents.on('did-navigate', onNavEvent)
    view.webContents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) onNavEvent()
    })
    // Title updates fire for ALL accounts (incl. background), so unread counts
    // stay live even for accounts you aren't currently viewing.
    view.webContents.on('page-title-updated', (_event, title) => {
      const count = parseUnread(title)
      if (count !== managed.unread) {
        managed.unread = count
        this.emitUnread(config.id, count)
      }
      if (this.activeId === config.id) this.emitNav()
    })

    // Keep popups (auth, "open in new window") in the same account session,
    // never the default session (REQUIREMENTS.md §4.6).
    view.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition: partitionFor(config.id),
          contextIsolation: true,
          nodeIntegration: false
        }
      }
    }))

    void view.webContents.loadURL(startUrl)

    this.views.set(config.id, managed)
    this.order.push(config.id)
    this.win.contentView.addChildView(view)

    if (!this.activeId) this.setActive(config.id)
    this.layout()
  }

  setActive(id: string): void {
    if (!this.views.has(id)) return
    this.activeId = id
    for (const [viewId, { view }] of this.views) {
      view.setVisible(viewId === id && !this.overlayOpen)
    }
    this.layout()
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('accounts:active-changed', id)
    }
    this.emitNav()
    this.onState?.()
  }

  getActiveId(): string | undefined {
    return this.activeId
  }

  /** Switch to the Nth account (0-based) — backs the Cmd-1…9 shortcuts. */
  setActiveByIndex(index: number): void {
    const id = this.order[index]
    if (id) this.setActive(id)
  }

  /** Hide/show the active web view so DOM modals can render above it. */
  setOverlayOpen(open: boolean): void {
    this.overlayOpen = open
    const active = this.activeId ? this.views.get(this.activeId) : undefined
    active?.view.setVisible(!open)
  }

  /** Native right-click menu for a sidebar account (floats above the web view). */
  popupAccountMenu(accountId: string): void {
    if (!this.views.has(accountId)) return
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        click: () => this.win.webContents.send('menu:edit-account', accountId)
      },
      { type: 'separator' },
      { label: 'Remove', click: () => void this.removeAccount(accountId) }
    ]).popup({ window: this.win })
  }

  /** Native right-click menu for a shortcut pill. */
  popupShortcutMenu(accountId: string, shortcutId: string): void {
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        click: () => this.win.webContents.send('menu:edit-shortcut', { accountId, shortcutId })
      },
      { type: 'separator' },
      { label: 'Remove', click: () => this.removeShortcut(accountId, shortcutId) }
    ]).popup({ window: this.win })
  }

  private activeWebContents(): WebContents | undefined {
    return this.activeId ? this.views.get(this.activeId)?.view.webContents : undefined
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
    return this.activeId ? this.navStateFor(this.activeId) : null
  }

  private navStateFor(id: string): NavState {
    const wc = this.views.get(id)!.view.webContents
    return {
      accountId: id,
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      title: wc.getTitle()
    }
  }

  private emitNav(): void {
    if (this.activeId && !this.win.isDestroyed()) {
      this.win.webContents.send('nav:state', this.navStateFor(this.activeId))
    }
  }

  summaries(): AccountSummary[] {
    return this.order.map((id) => {
      const { config } = this.views.get(id)!
      return { id: config.id, label: config.label, color: config.color }
    })
  }

  /** Map of account id → session partition string (test/diagnostic use). */
  partitions(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const id of this.order) out[id] = partitionFor(id)
    return out
  }

  /** Snapshot for persistence: includes each account's latest URL as lastUrl. */
  snapshotAccounts(): PersistedAccount[] {
    return this.order.map((id, index) => {
      const { config, currentUrl } = this.views.get(id)!
      return {
        id: config.id,
        label: config.label,
        color: config.color,
        homeUrl: config.homeUrl,
        lastUrl: currentUrl,
        order: index,
        shortcuts: this.views.get(id)!.shortcuts
      }
    })
  }

  private emitUpdated(): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('accounts:updated', this.summaries())
    }
  }

  shortcutsFor(id: string): Shortcut[] {
    return this.views.get(id)?.shortcuts ?? []
  }

  addShortcut(id: string, input: ShortcutInput): void {
    const managed = this.views.get(id)
    if (!managed) return
    managed.shortcuts.push({
      id: randomUUID(),
      label: input.label.trim() || 'Shortcut',
      url: normalizeUrl(input.url) || input.url
    })
    this.emitShortcuts(id)
    this.onState?.()
  }

  updateShortcut(id: string, shortcutId: string, patch: ShortcutPatch): void {
    const shortcut = this.views.get(id)?.shortcuts.find((s) => s.id === shortcutId)
    if (!shortcut) return
    if (patch.label !== undefined) shortcut.label = patch.label.trim() || shortcut.label
    if (patch.url !== undefined) shortcut.url = normalizeUrl(patch.url) || shortcut.url
    this.emitShortcuts(id)
    this.onState?.()
  }

  removeShortcut(id: string, shortcutId: string): void {
    const managed = this.views.get(id)
    if (!managed) return
    managed.shortcuts = managed.shortcuts.filter((s) => s.id !== shortcutId)
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

  /** Current unread count per account id (for the renderer's initial fetch). */
  unreadAll(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const id of this.order) out[id] = this.views.get(id)!.unread
    return out
  }

  /** Re-position the active account view in the area right of the sidebar. */
  private layout(): void {
    const [width, height] = this.win.getContentSize()
    const active = this.activeId ? this.views.get(this.activeId) : undefined
    if (!active) return
    active.view.setBounds({
      x: SIDEBAR_WIDTH,
      y: TOP_CHROME_HEIGHT,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height: Math.max(0, height - TOP_CHROME_HEIGHT)
    })
  }
}
