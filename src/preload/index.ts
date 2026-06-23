import { contextBridge, ipcRenderer } from 'electron'
import type { AccountSummary, GlideApi, NavState, Shortcut, TabsState } from '../shared/types'

// Typed, minimal bridge exposed to the renderer. The renderer holds no session
// state — it sends intents to main and renders state pushed back.
const api: GlideApi = {
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
  openShortcut: (accountId, shortcutId) => ipcRenderer.invoke('tabs:open', accountId, shortcutId),
  closeTab: (accountId, shortcutId) => ipcRenderer.invoke('tabs:close', accountId, shortcutId),
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
  __test: {
    partitions: () => ipcRenderer.invoke('__test:partitions'),
    setCookie: (arg) => ipcRenderer.invoke('__test:set-cookie', arg),
    getCookies: (arg) => ipcRenderer.invoke('__test:get-cookies', arg)
  }
}

contextBridge.exposeInMainWorld('glide', api)
