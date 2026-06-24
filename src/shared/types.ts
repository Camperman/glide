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
  /** Cached favicon URL for the app rail (captured from the loaded page). */
  favicon?: string
}

/** Where the app rail is rendered. */
export type AppRailLayout = 'left' | 'top'

export interface BookmarkLink {
  type: 'link'
  id: string
  title: string
  url: string
}

export interface BookmarkFolder {
  type: 'folder'
  id: string
  title: string
  children: BookmarkNode[]
}

export type BookmarkNode = BookmarkLink | BookmarkFolder

export interface BookmarksState {
  accountId: string
  bookmarks: BookmarkNode[]
}

/** A Chrome profile available to import bookmarks from. */
export interface ChromeProfile {
  dir: string
  name: string
  count: number
}

/** An app as shown in the vertical app rail (a shortcut + live state). */
export interface AppInfo {
  id: string
  label: string
  favicon?: string
  unread: number
}

/** Drives the app rail: the profile's apps + which one is currently active. */
export interface AppsState {
  accountId: string
  apps: AppInfo[]
  activeShortcutId?: string
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

/** One open tab as shown in the tab strip. */
export interface TabInfo {
  id: string
  title: string
  active: boolean
  favicon?: string
  /** The app (shortcut) this tab was opened from, if any. */
  shortcutId?: string
}

/** Open tabs for the active account (drives the tab strip). */
export interface TabsState {
  accountId: string
  tabs: TabInfo[]
}

/** The bridge exposed on `window.glide` in the renderer (see preload). */
export interface GlideApi {
  /** Open a new app window (Cmd-N). */
  newWindow(): Promise<void>
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
  getApps(accountId: string): Promise<{ apps: AppInfo[]; activeShortcutId?: string }>
  /** Reorder a profile's apps (drag-and-drop in the app rail). */
  reorderShortcuts(accountId: string, shortcutIds: string[]): Promise<void>
  /** Subscribe to the active profile's app rail state. Returns an unsubscribe fn. */
  onAppsState(cb: (state: AppsState) => void): () => void
  getLayout(): Promise<AppRailLayout>
  /** Subscribe to app-rail layout changes (toggled from the View menu). */
  onLayoutChanged(cb: (layout: AppRailLayout) => void): () => void
  getBookmarks(accountId: string): Promise<BookmarkNode[]>
  onBookmarksState(cb: (state: BookmarksState) => void): () => void
  /** Open a bookmark URL in a new tab. */
  openBookmark(accountId: string, url: string): Promise<void>
  /** Open a native popup menu for a bookmark folder (handles nested folders). */
  openBookmarkFolder(accountId: string, folderId: string): Promise<void>
  /** Open a native popup menu for bookmark-bar items that overflow ("More" »). */
  openBookmarksOverflow(accountId: string, ids: string[]): Promise<void>
  getBookmarksBarVisible(): Promise<boolean>
  onBookmarksBarVisible(cb: (visible: boolean) => void): () => void
  /** Chrome profiles available to import from. */
  getChromeProfiles(): Promise<ChromeProfile[]>
  importChromeBookmarks(accountId: string, chromeDir: string): Promise<void>
  /** Fired when the user picks Bookmarks → Import from Chrome in the menu. */
  onImportBookmarks(cb: () => void): () => void
  addShortcut(accountId: string, input: ShortcutInput): Promise<void>
  updateShortcut(accountId: string, shortcutId: string, patch: ShortcutPatch): Promise<void>
  removeShortcut(accountId: string, shortcutId: string): Promise<void>
  /** Bookmark click: focus the tab opened from it, else open a new one. */
  openShortcut(accountId: string, shortcutId: string): Promise<void>
  /** Open a brand-new tab (+ / Cmd-T). */
  newTab(accountId: string): Promise<void>
  /** Focus an existing tab by id. */
  activateTab(accountId: string, tabId: string): Promise<void>
  /** Close (unload) a tab by id. */
  closeTab(accountId: string, tabId: string): Promise<void>
  /** Reorder tabs to match the given id order (drag-and-drop). */
  reorderTabs(accountId: string, tabIds: string[]): Promise<void>
  getTabs(accountId: string): Promise<TabInfo[]>
  /** Subscribe to the active account's open tabs. Returns an unsubscribe fn. */
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
