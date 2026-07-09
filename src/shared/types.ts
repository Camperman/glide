// Types shared across main, preload, and renderer.

export interface AccountSummary {
  id: string
  label: string
  color: string
  /** Google account photo URL, scraped from the logged-in page (best-effort). */
  avatarUrl?: string
  /** Notifications from this account are suppressed. */
  muted?: boolean
  /** Incognito session — memory-only, disappears on quit. */
  ephemeral?: boolean
}

export interface NewAccountInput {
  label: string
  color: string
  homeUrl: string
}

export interface AccountPatch {
  label?: string
  color?: string
  muted?: boolean
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
  /** One of this app's tabs is playing audio. */
  audible?: boolean
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

/** Light/dark selection; 'system' follows macOS. */
export type Appearance = 'system' | 'light' | 'dark'

export type SearchEngine = 'google' | 'duckduckgo' | 'bing'

/** User preferences (Preferences window). Persisted with app state. */
export interface Prefs {
  appearance: Appearance
  /** Color profile id — see shared/themes.ts. */
  themeId: string
  launchAtLogin: boolean
  newTabUrl: string
  searchEngine: SearchEngine
  /** '' = the OS default ~/Downloads. */
  downloadsDir: string
  askWhereToSave: boolean
  /** Chrome accent follows the active account's color. */
  accountAccent: boolean
}

/** One browsing-history entry (Cmd-Y page + omnibox suggestions). */
export interface HistoryItem {
  url: string
  title: string
  visits: number
  lastVisit: number
}

/** Prefs plus the resolved appearance (main owns nativeTheme resolution). */
export interface PrefsState {
  prefs: Prefs
  /** True when the effective appearance is dark (appearance + OS resolved). */
  dark: boolean
}

/** A Chrome extension installed in one account's partition. */
export interface ExtensionInfo {
  id: string
  name: string
  version: string
}

/** One download, active or finished, as shown in the downloads panel. */
export interface DownloadInfo {
  id: string
  /** Display filename (basename of `path`). */
  filename: string
  /** Final save path on disk. */
  path: string
  accountId: string
  /** 0 when the server didn't send a length. */
  totalBytes: number
  receivedBytes: number
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'
  startedAt: number
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
  /** Currently playing audio. */
  audible?: boolean
  /** Audio muted by the user (speaker toggle). */
  muted?: boolean
}

/** Open tabs for the active account (drives the tab strip). */
export interface TabsState {
  accountId: string
  tabs: TabInfo[]
}

/** The bridge exposed on `window.flit` in the renderer (see preload). */
export interface FlitApi {
  /** Open a new app window (Cmd-N). */
  newWindow(): Promise<void>
  /** Fresh install? Drives the one-time welcome flow. */
  isFirstRun(): Promise<boolean>
  /** Welcome flow finished — never show it again. */
  completeFirstRun(): Promise<void>
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
  /** Right-click menu for a bookmarks-bar link (Edit / Remove). */
  showBookmarkMenu(accountId: string, bookmarkId: string): Promise<void>
  updateBookmark(
    accountId: string,
    bookmarkId: string,
    patch: { title?: string; url?: string }
  ): Promise<void>
  /** Native "Edit" chosen for a bookmark. Returns an unsubscribe fn. */
  onEditBookmark(cb: (update: { accountId: string; bookmarkId: string }) => void): () => void
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
  /** Toggle the tab's audio mute (speaker icon in the tab strip). */
  toggleTabMute(accountId: string, tabId: string): Promise<void>
  /** Right-click menu for a tab (Pin to Apps / Duplicate / Close). */
  showTabMenu(accountId: string, tabId: string): Promise<void>
  /** Hovered-link URL from the active page ('' when unhovered). */
  onTargetUrl(cb: (url: string) => void): () => void
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
  /** Fired when the user picks Flit → Preferences… in the menu (Cmd-,). */
  onOpenPreferences(cb: () => void): () => void
  /** Cmd-F pressed: show the find bar (main already reserved its row). */
  onFindOpen(cb: () => void): () => void
  /** Match counts from the page, for the find bar's "3 / 17" readout. */
  onFindResult(cb: (result: { matches: number; activeMatchOrdinal: number }) => void): () => void
  /** Search (next=false starts a new query; next=true moves the selection). */
  findInPage(text: string, next: boolean, forward: boolean): Promise<void>
  /** Dismiss the find bar; main clears highlights and reclaims the row. */
  stopFind(): Promise<void>
  /** Main dismissed the find bar (e.g. account switch). */
  onFindClose(cb: () => void): () => void
  /** Cmd-L pressed: focus + select the address bar. */
  onFocusAddress(cb: () => void): () => void
  /** Cmd-Y pressed: open the history page. */
  onOpenHistory(cb: () => void): () => void
  /** Cmd-K pressed: open the quick switcher. */
  onOpenPalette(cb: () => void): () => void
  /** Recent history for an account (query '' = recent-first). */
  listHistory(accountId: string, query: string): Promise<HistoryItem[]>
  /** Clear all history for an account. */
  clearHistory(accountId: string): Promise<void>
  /** Omnibox text changed; rect = address field bounds (window coords). */
  omniboxInput(
    text: string,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<void>
  /** Arrow-key through suggestions; resolves the text to show, if any. */
  omniboxNav(delta: 1 | -1): Promise<string | undefined>
  /** Dismiss the suggestions dropdown. */
  omniboxHide(): Promise<void>
  /** Current preferences + resolved dark/light (defaults merged in). */
  getPrefs(): Promise<PrefsState>
  /** Patch preferences; main applies side effects and broadcasts. */
  setPrefs(patch: Partial<Prefs>): Promise<void>
  /** Subscribe to preference/appearance changes. Returns an unsubscribe fn. */
  onPrefsChanged(cb: (state: PrefsState) => void): () => void
  /** Forget every remembered site-permission answer (all accounts). */
  resetSitePermissions(): Promise<void>
  /** Native folder picker for the downloads location ('' if cancelled). */
  chooseDownloadsDir(): Promise<string>
  /** Is Flit the macOS default browser right now? */
  isDefaultBrowser(): Promise<boolean>
  /** Ask macOS to make Flit the default browser (shows a system dialog). */
  makeDefaultBrowser(): Promise<void>
  /** Chrome extensions installed in an account's partition. */
  listExtensions(accountId: string): Promise<ExtensionInfo[]>
  uninstallExtension(accountId: string, extensionId: string): Promise<void>
  /** All downloads this session (active first, newest first). */
  getDownloads(): Promise<DownloadInfo[]>
  /** Subscribe to the download list changing. Returns an unsubscribe fn. */
  onDownloadsState(cb: (downloads: DownloadInfo[]) => void): () => void
  /** Open a completed download with its default app. */
  openDownload(id: string): Promise<void>
  /** Reveal a download in Finder. */
  showDownload(id: string): Promise<void>
  /** Cancel an in-progress download. */
  cancelDownload(id: string): Promise<void>
  /** Clear finished/cancelled downloads from the list. */
  clearDownloads(): Promise<void>
  /** Test-only helpers used by tests/isolation.spec.ts to prove session isolation. */
  __test: {
    partitions(): Promise<Record<string, string>>
    setCookie(arg: { partition: string; url: string; name: string; value: string }): Promise<void>
    getCookies(arg: { partition: string; url: string }): Promise<TestCookie[]>
  }
}
