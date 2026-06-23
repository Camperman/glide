// Types shared across main, preload, and renderer.

export interface AccountSummary {
  id: string
  label: string
  color: string
  /** Google account photo URL, scraped from the logged-in page (best-effort). */
  avatarUrl?: string
}

export interface NewAccountInput {
  label: string
  color: string
  homeUrl: string
}

export interface AccountPatch {
  label?: string
  color?: string
}

export interface Shortcut {
  id: string
  label: string
  url: string
}

export interface ShortcutInput {
  label: string
  url: string
}

export interface ShortcutPatch {
  label?: string
  url?: string
}

export interface TestCookie {
  name: string
  value: string
}

/** Navigation state of the active account view, pushed to the top bar. */
export interface NavState {
  accountId: string
  /** The active tab (shortcut id) within the account. */
  tabId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  title: string
}

/** Open tabs + active tab for the active account (drives the tab strip). */
export interface TabsState {
  accountId: string
  open: string[]
  active?: string
}

/** The bridge exposed on `window.glide` in the renderer (see preload). */
export interface GlideApi {
  listAccounts(): Promise<AccountSummary[]>
  getActive(): Promise<string | undefined>
  switchAccount(id: string): Promise<void>
  addAccount(input: NewAccountInput): Promise<void>
  updateAccount(id: string, patch: AccountPatch): Promise<void>
  removeAccount(id: string): Promise<void>
  goBack(): Promise<void>
  goForward(): Promise<void>
  reload(): Promise<void>
  navigate(url: string): Promise<void>
  getNavState(): Promise<NavState | null>
  /** Subscribe to active-view navigation state changes. Returns an unsubscribe fn. */
  onNavState(cb: (state: NavState) => void): () => void
  getUnread(): Promise<Record<string, number>>
  /** Subscribe to per-account unread-count changes. Returns an unsubscribe fn. */
  onUnread(cb: (update: { id: string; count: number }) => void): () => void
  getShortcuts(accountId: string): Promise<Shortcut[]>
  addShortcut(accountId: string, input: ShortcutInput): Promise<void>
  updateShortcut(accountId: string, shortcutId: string, patch: ShortcutPatch): Promise<void>
  removeShortcut(accountId: string, shortcutId: string): Promise<void>
  /** Open or focus (no reload) the tab for a shortcut. */
  openShortcut(accountId: string, shortcutId: string): Promise<void>
  /** Close (unload) a shortcut's tab. */
  closeTab(accountId: string, shortcutId: string): Promise<void>
  getTabs(accountId: string): Promise<{ open: string[]; active?: string }>
  /** Subscribe to the active account's open/active tab set. Returns an unsubscribe fn. */
  onTabsState(cb: (state: TabsState) => void): () => void
  /** Subscribe to a profile's shortcut list changing. Returns an unsubscribe fn. */
  onShortcutsUpdated(cb: (update: { accountId: string; shortcuts: Shortcut[] }) => void): () => void
  /** Open the native right-click menu for an account (floats above the web view). */
  showAccountMenu(accountId: string): Promise<void>
  /** Open the native right-click menu for a shortcut. */
  showShortcutMenu(accountId: string, shortcutId: string): Promise<void>
  /** Tell main a DOM modal is open/closed so it can hide/show the web view. */
  setOverlay(open: boolean): Promise<void>
  /** Native "Edit" chosen for an account. Returns an unsubscribe fn. */
  onEditAccount(cb: (accountId: string) => void): () => void
  /** Native "Edit" chosen for a shortcut. Returns an unsubscribe fn. */
  onEditShortcut(cb: (update: { accountId: string; shortcutId: string }) => void): () => void
  /** Subscribe to active-account changes pushed from main. Returns an unsubscribe fn. */
  onActiveChanged(cb: (id: string) => void): () => void
  /** Subscribe to the account list changing (add/edit/remove). Returns an unsubscribe fn. */
  onAccountsUpdated(cb: (accounts: AccountSummary[]) => void): () => void
  /** Test-only helpers used by tests/isolation.spec.ts to prove session isolation. */
  __test: {
    partitions(): Promise<Record<string, string>>
    setCookie(arg: { partition: string; url: string; name: string; value: string }): Promise<void>
    getCookies(arg: { partition: string; url: string }): Promise<TestCookie[]>
  }
}
