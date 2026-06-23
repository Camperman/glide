import { BrowserWindow, WebContentsView } from 'electron'
import type { AccountSummary } from '../shared/types'
import type { PersistedAccount } from './persistence'

export const SIDEBAR_WIDTH = 64

export interface AccountConfig {
  id: string
  label: string
  color: string
  homeUrl: string
  lastUrl?: string
}

interface ManagedView {
  config: AccountConfig
  view: WebContentsView
  currentUrl: string
}

export function partitionFor(id: string): string {
  return `persist:account-${id}`
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

  constructor(win: BrowserWindow, onState?: () => void) {
    this.win = win
    this.onState = onState
    this.win.on('resize', () => this.layout())
  }

  load(configs: AccountConfig[]): void {
    for (const config of configs) this.createAccount(config)
  }

  createAccount(config: AccountConfig): void {
    if (this.views.has(config.id)) return

    const view = new WebContentsView({
      webPreferences: {
        partition: partitionFor(config.id),
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    view.setBackgroundColor('#ffffff')

    const startUrl = config.lastUrl ?? config.homeUrl
    const managed: ManagedView = { config, view, currentUrl: startUrl }

    const trackUrl = (url: string): void => {
      managed.currentUrl = url
      this.onState?.()
    }
    view.webContents.on('did-navigate', (_event, url) => trackUrl(url))
    view.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) trackUrl(url)
    })

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
      view.setVisible(viewId === id)
    }
    this.layout()
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('accounts:active-changed', id)
    }
    this.onState?.()
  }

  getActiveId(): string | undefined {
    return this.activeId
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
        order: index
      }
    })
  }

  /** Re-position the active account view in the area right of the sidebar. */
  private layout(): void {
    const [width, height] = this.win.getContentSize()
    const active = this.activeId ? this.views.get(this.activeId) : undefined
    if (!active) return
    active.view.setBounds({
      x: SIDEBAR_WIDTH,
      y: 0,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height
    })
  }
}
