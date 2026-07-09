import { contextBridge, ipcRenderer } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import type {
  AccountSummary,
  AppRailLayout,
  AppsState,
  BookmarksState,
  DownloadInfo,
  GlideApi,
  NavState,
  PrefsState,
  Shortcut,
  TabsState
} from '../shared/types'

// Typed, minimal bridge exposed to the renderer. The renderer holds no session
// state — it sends intents to main and renders state pushed back.
const api: GlideApi = {
  newWindow: () => ipcRenderer.invoke('window:new'),
  isFirstRun: () => ipcRenderer.invoke('app:first-run'),
  completeFirstRun: () => ipcRenderer.invoke('app:first-run-done'),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  getActive: () => ipcRenderer.invoke('accounts:active'),
  switchAccount: (id) => ipcRenderer.invoke('accounts:switch', id),
  addAccount: (input) => ipcRenderer.invoke('accounts:add', input),
  updateAccount: (id, patch) => ipcRenderer.invoke('accounts:update', id, patch),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),
  onActiveChanged: (cb) => {
    const listener = (_event: unknown, id: string): void => cb(id)
    ipcRenderer.on('accounts:active-changed', listener)
    return () => ipcRenderer.removeListener('accounts:active-changed', listener)
  },
  onAccountsUpdated: (cb) => {
    const listener = (_event: unknown, accounts: AccountSummary[]): void => cb(accounts)
    ipcRenderer.on('accounts:updated', listener)
    return () => ipcRenderer.removeListener('accounts:updated', listener)
  },
  goBack: () => ipcRenderer.invoke('nav:back'),
  goForward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  navigate: (url) => ipcRenderer.invoke('nav:go', url),
  getNavState: () => ipcRenderer.invoke('nav:state'),
  onNavState: (cb) => {
    const listener = (_event: unknown, state: NavState): void => cb(state)
    ipcRenderer.on('nav:state', listener)
    return () => ipcRenderer.removeListener('nav:state', listener)
  },
  getUnread: () => ipcRenderer.invoke('accounts:unread-all'),
  onUnread: (cb) => {
    const listener = (_event: unknown, update: { id: string; count: number }): void => cb(update)
    ipcRenderer.on('accounts:unread', listener)
    return () => ipcRenderer.removeListener('accounts:unread', listener)
  },
  getShortcuts: (accountId) => ipcRenderer.invoke('shortcuts:list', accountId),
  getApps: (accountId) => ipcRenderer.invoke('apps:list', accountId),
  reorderShortcuts: (accountId, shortcutIds) =>
    ipcRenderer.invoke('apps:reorder', accountId, shortcutIds),
  onAppsState: (cb) => {
    const listener = (_event: unknown, state: AppsState): void => cb(state)
    ipcRenderer.on('apps:state', listener)
    return () => ipcRenderer.removeListener('apps:state', listener)
  },
  getLayout: () => ipcRenderer.invoke('layout:get'),
  onLayoutChanged: (cb) => {
    const listener = (_event: unknown, layout: AppRailLayout): void => cb(layout)
    ipcRenderer.on('layout:changed', listener)
    return () => ipcRenderer.removeListener('layout:changed', listener)
  },
  getBookmarks: (accountId) => ipcRenderer.invoke('bookmarks:list', accountId),
  onBookmarksState: (cb) => {
    const listener = (_event: unknown, state: BookmarksState): void => cb(state)
    ipcRenderer.on('bookmarks:state', listener)
    return () => ipcRenderer.removeListener('bookmarks:state', listener)
  },
  openBookmark: (accountId, url) => ipcRenderer.invoke('bookmarks:open', accountId, url),
  openBookmarkFolder: (accountId, folderId) =>
    ipcRenderer.invoke('bookmarks:open-folder', accountId, folderId),
  openBookmarksOverflow: (accountId, ids) =>
    ipcRenderer.invoke('bookmarks:open-overflow', accountId, ids),
  showBookmarkMenu: (accountId, bookmarkId) =>
    ipcRenderer.invoke('menu:bookmark', accountId, bookmarkId),
  updateBookmark: (accountId, bookmarkId, patch) =>
    ipcRenderer.invoke('bookmarks:update', accountId, bookmarkId, patch),
  onEditBookmark: (cb) => {
    const listener = (
      _event: unknown,
      update: { accountId: string; bookmarkId: string }
    ): void => cb(update)
    ipcRenderer.on('menu:edit-bookmark', listener)
    return () => ipcRenderer.removeListener('menu:edit-bookmark', listener)
  },
  getBookmarksBarVisible: () => ipcRenderer.invoke('bookmarks:bar-visible'),
  onBookmarksBarVisible: (cb) => {
    const listener = (_event: unknown, visible: boolean): void => cb(visible)
    ipcRenderer.on('bookmarks:visible', listener)
    return () => ipcRenderer.removeListener('bookmarks:visible', listener)
  },
  getChromeProfiles: () => ipcRenderer.invoke('bookmarks:chrome-profiles'),
  importChromeBookmarks: (accountId, chromeDir) =>
    ipcRenderer.invoke('bookmarks:import', accountId, chromeDir),
  onImportBookmarks: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:import-bookmarks', listener)
    return () => ipcRenderer.removeListener('menu:import-bookmarks', listener)
  },
  addShortcut: (accountId, input) => ipcRenderer.invoke('shortcuts:add', accountId, input),
  updateShortcut: (accountId, shortcutId, patch) =>
    ipcRenderer.invoke('shortcuts:update', accountId, shortcutId, patch),
  removeShortcut: (accountId, shortcutId) =>
    ipcRenderer.invoke('shortcuts:remove', accountId, shortcutId),
  onShortcutsUpdated: (cb) => {
    const listener = (
      _event: unknown,
      update: { accountId: string; shortcuts: Shortcut[] }
    ): void => cb(update)
    ipcRenderer.on('shortcuts:updated', listener)
    return () => ipcRenderer.removeListener('shortcuts:updated', listener)
  },
  openShortcut: (accountId, shortcutId) =>
    ipcRenderer.invoke('tabs:open-shortcut', accountId, shortcutId),
  newTab: (accountId) => ipcRenderer.invoke('tabs:new', accountId),
  activateTab: (accountId, tabId) => ipcRenderer.invoke('tabs:activate', accountId, tabId),
  closeTab: (accountId, tabId) => ipcRenderer.invoke('tabs:close', accountId, tabId),
  reorderTabs: (accountId, tabIds) => ipcRenderer.invoke('tabs:reorder', accountId, tabIds),
  toggleTabMute: (accountId, tabId) => ipcRenderer.invoke('tabs:toggle-mute', accountId, tabId),
  showTabMenu: (accountId, tabId) => ipcRenderer.invoke('menu:tab', accountId, tabId),
  onTargetUrl: (cb) => {
    const listener = (_event: unknown, url: string): void => cb(url)
    ipcRenderer.on('nav:target-url', listener)
    return () => ipcRenderer.removeListener('nav:target-url', listener)
  },
  getTabs: (accountId) => ipcRenderer.invoke('tabs:list', accountId),
  onTabsState: (cb) => {
    const listener = (_event: unknown, state: TabsState): void => cb(state)
    ipcRenderer.on('tabs:state', listener)
    return () => ipcRenderer.removeListener('tabs:state', listener)
  },
  showAccountMenu: (accountId) => ipcRenderer.invoke('menu:account', accountId),
  showShortcutMenu: (accountId, shortcutId) =>
    ipcRenderer.invoke('menu:shortcut', accountId, shortcutId),
  setOverlay: (open) => ipcRenderer.invoke('chrome:overlay', open),
  onEditAccount: (cb) => {
    const listener = (_event: unknown, accountId: string): void => cb(accountId)
    ipcRenderer.on('menu:edit-account', listener)
    return () => ipcRenderer.removeListener('menu:edit-account', listener)
  },
  onEditShortcut: (cb) => {
    const listener = (
      _event: unknown,
      update: { accountId: string; shortcutId: string }
    ): void => cb(update)
    ipcRenderer.on('menu:edit-shortcut', listener)
    return () => ipcRenderer.removeListener('menu:edit-shortcut', listener)
  },
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  onPrefsChanged: (cb) => {
    const listener = (_event: unknown, state: PrefsState): void => cb(state)
    ipcRenderer.on('prefs:changed', listener)
    return () => ipcRenderer.removeListener('prefs:changed', listener)
  },
  onOpenPreferences: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:preferences', listener)
    return () => ipcRenderer.removeListener('menu:preferences', listener)
  },
  onFindOpen: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('find:open', listener)
    return () => ipcRenderer.removeListener('find:open', listener)
  },
  onFindResult: (cb) => {
    const listener = (
      _event: unknown,
      result: { matches: number; activeMatchOrdinal: number }
    ): void => cb(result)
    ipcRenderer.on('find:result', listener)
    return () => ipcRenderer.removeListener('find:result', listener)
  },
  findInPage: (text, next, forward) => ipcRenderer.invoke('find:query', text, next, forward),
  stopFind: () => ipcRenderer.invoke('find:stop'),
  onFindClose: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('find:close', listener)
    return () => ipcRenderer.removeListener('find:close', listener)
  },
  onFocusAddress: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:focus-address', listener)
    return () => ipcRenderer.removeListener('menu:focus-address', listener)
  },
  onOpenHistory: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:history', listener)
    return () => ipcRenderer.removeListener('menu:history', listener)
  },
  onOpenPalette: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:palette', listener)
    return () => ipcRenderer.removeListener('menu:palette', listener)
  },
  listHistory: (accountId, query) => ipcRenderer.invoke('history:list', accountId, query),
  clearHistory: (accountId) => ipcRenderer.invoke('history:clear', accountId),
  omniboxInput: (text, rect) => ipcRenderer.invoke('omnibox:input', text, rect),
  omniboxNav: (delta) => ipcRenderer.invoke('omnibox:nav', delta),
  omniboxHide: () => ipcRenderer.invoke('omnibox:hide'),
  chooseDownloadsDir: () => ipcRenderer.invoke('prefs:choose-downloads-dir'),
  isDefaultBrowser: () => ipcRenderer.invoke('prefs:is-default-browser'),
  makeDefaultBrowser: () => ipcRenderer.invoke('prefs:make-default-browser'),
  listExtensions: (accountId) => ipcRenderer.invoke('extensions:list', accountId),
  uninstallExtension: (accountId, extensionId) =>
    ipcRenderer.invoke('extensions:uninstall', accountId, extensionId),
  getDownloads: () => ipcRenderer.invoke('downloads:list'),
  onDownloadsState: (cb) => {
    const listener = (_event: unknown, downloads: DownloadInfo[]): void => cb(downloads)
    ipcRenderer.on('downloads:state', listener)
    return () => ipcRenderer.removeListener('downloads:state', listener)
  },
  openDownload: (id) => ipcRenderer.invoke('downloads:open', id),
  showDownload: (id) => ipcRenderer.invoke('downloads:show', id),
  cancelDownload: (id) => ipcRenderer.invoke('downloads:cancel', id),
  clearDownloads: () => ipcRenderer.invoke('downloads:clear'),
  __test: {
    partitions: () => ipcRenderer.invoke('__test:partitions'),
    setCookie: (arg) => ipcRenderer.invoke('__test:set-cookie', arg),
    getCookies: (arg) => ipcRenderer.invoke('__test:get-cookies', arg)
  }
}

contextBridge.exposeInMainWorld('glide', api)

// Register the <browser-action-list> custom element (extension toolbar).
// This preload only ever runs in Glide's own chrome UI — account views get
// no preload — so no URL gating is needed.
injectBrowserAction()
