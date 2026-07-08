import { BrowserWindow, app, dialog, ipcMain, session, type IpcMainInvokeEvent } from 'electron'
import type { AccountManager } from './accounts'
import type { DownloadManager } from './downloads'
import type { ExtensionManager } from './extensions'
import type { OmniboxManager } from './omnibox'
import type { PrefsManager } from './prefs'
import type {
  AccountPatch,
  NewAccountInput,
  Prefs,
  ShortcutInput,
  ShortcutPatch
} from '../shared/types'

/**
 * Wire the renderer ↔ main IPC. Window-scoped calls (active account, tabs, nav)
 * resolve the sending BrowserWindow from the event so each window acts on its
 * own views. Metadata/settings calls are global and broadcast to all windows.
 */
export function registerIpc(
  accounts: AccountManager,
  onNewWindow: () => void,
  downloads: DownloadManager,
  prefs: PrefsManager,
  extensions: ExtensionManager,
  omnibox: OmniboxManager
): void {
  const winOf = (event: IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)

  // ---- window-scoped (the window that sent the event) ----
  ipcMain.handle('window:new', () => onNewWindow())

  ipcMain.handle('accounts:active', (e) => {
    const win = winOf(e)
    return win ? accounts.getActiveId(win) : undefined
  })
  ipcMain.handle('accounts:switch', (e, id: string) => {
    const win = winOf(e)
    if (win) accounts.setActive(win, id)
  })
  ipcMain.handle('accounts:unread-all', (e) => {
    const win = winOf(e)
    return win ? accounts.unreadAll(win) : {}
  })

  ipcMain.handle('nav:back', (e) => {
    const win = winOf(e)
    if (win) accounts.goBack(win)
  })
  ipcMain.handle('nav:forward', (e) => {
    const win = winOf(e)
    if (win) accounts.goForward(win)
  })
  ipcMain.handle('nav:reload', (e) => {
    const win = winOf(e)
    if (win) accounts.reload(win)
  })
  ipcMain.handle('nav:go', (e, url: string) => {
    const win = winOf(e)
    if (win) accounts.navigate(win, url)
  })
  ipcMain.handle('nav:state', (e) => {
    const win = winOf(e)
    return win ? accounts.getActiveNavState(win) : null
  })

  ipcMain.handle('apps:list', (e, accountId: string) => {
    const win = winOf(e)
    return win ? accounts.getApps(win, accountId) : { apps: [] }
  })
  ipcMain.handle('tabs:list', (e, accountId: string) => {
    const win = winOf(e)
    return win ? accounts.getTabs(win, accountId) : []
  })
  ipcMain.handle('tabs:open-shortcut', (e, accountId: string, shortcutId: string) => {
    const win = winOf(e)
    if (win) accounts.openShortcut(win, accountId, shortcutId)
  })
  ipcMain.handle('tabs:new', (e, accountId: string) => {
    const win = winOf(e)
    if (win) accounts.newTab(win, accountId)
  })
  ipcMain.handle('tabs:activate', (e, accountId: string, tabId: string) => {
    const win = winOf(e)
    if (win) accounts.activateTab(win, accountId, tabId)
  })
  ipcMain.handle('tabs:close', (e, accountId: string, tabId: string) => {
    const win = winOf(e)
    if (win) accounts.closeTab(win, accountId, tabId)
  })
  ipcMain.handle('tabs:reorder', (e, accountId: string, tabIds: string[]) => {
    const win = winOf(e)
    if (win) accounts.reorderTabs(win, accountId, tabIds)
  })
  ipcMain.handle('tabs:toggle-mute', (e, accountId: string, tabId: string) => {
    const win = winOf(e)
    if (win) accounts.toggleTabMute(win, accountId, tabId)
  })

  ipcMain.handle('bookmarks:open', (e, accountId: string, url: string) => {
    const win = winOf(e)
    if (win) accounts.openBookmark(win, accountId, url)
  })
  ipcMain.handle('bookmarks:open-folder', (e, accountId: string, folderId: string) => {
    const win = winOf(e)
    if (win) accounts.openBookmarkFolder(win, accountId, folderId)
  })
  ipcMain.handle('bookmarks:open-overflow', (e, accountId: string, ids: string[]) => {
    const win = winOf(e)
    if (win) accounts.openBookmarksOverflow(win, accountId, ids)
  })
  ipcMain.handle('menu:account', (e, accountId: string) => {
    const win = winOf(e)
    if (win) accounts.popupAccountMenu(win, accountId)
  })
  ipcMain.handle('menu:shortcut', (e, accountId: string, shortcutId: string) => {
    const win = winOf(e)
    if (win) accounts.popupShortcutMenu(win, accountId, shortcutId)
  })
  ipcMain.handle('chrome:overlay', (e, open: boolean) => {
    const win = winOf(e)
    if (win) accounts.setOverlayOpen(win, open)
  })

  ipcMain.handle('find:query', (e, text: string, next: boolean, forward: boolean) => {
    const win = winOf(e)
    if (win) accounts.findInPage(win, text, next, forward)
  })
  ipcMain.handle('find:stop', (e) => {
    const win = winOf(e)
    if (win) accounts.closeFind(win)
  })

  ipcMain.handle(
    'omnibox:input',
    (e, text: string, rect: { x: number; y: number; width: number; height: number }) => {
      const win = winOf(e)
      if (win) void omnibox.update(win, text, rect)
    }
  )
  ipcMain.handle('omnibox:nav', (e, delta: 1 | -1) => {
    const win = winOf(e)
    return win ? omnibox.navigate(win, delta) : undefined
  })
  ipcMain.handle('omnibox:hide', (e) => {
    const win = winOf(e)
    if (win) omnibox.hide(win)
  })

  // ---- global metadata / settings (broadcast to all windows) ----
  ipcMain.handle('accounts:list', () => accounts.summaries())
  ipcMain.handle('accounts:add', (_e, input: NewAccountInput) => {
    accounts.addAccount(input)
  })
  ipcMain.handle('accounts:update', (_e, id: string, patch: AccountPatch) =>
    accounts.updateAccount(id, patch)
  )
  ipcMain.handle('accounts:remove', (_e, id: string) => accounts.removeAccount(id))

  ipcMain.handle('shortcuts:list', (_e, accountId: string) => accounts.shortcutsFor(accountId))
  ipcMain.handle('shortcuts:add', (_e, accountId: string, input: ShortcutInput) =>
    accounts.addShortcut(accountId, input)
  )
  ipcMain.handle(
    'shortcuts:update',
    (_e, accountId: string, shortcutId: string, patch: ShortcutPatch) =>
      accounts.updateShortcut(accountId, shortcutId, patch)
  )
  ipcMain.handle('shortcuts:remove', (_e, accountId: string, shortcutId: string) =>
    accounts.removeShortcut(accountId, shortcutId)
  )
  ipcMain.handle('apps:reorder', (_e, accountId: string, shortcutIds: string[]) =>
    accounts.reorderShortcuts(accountId, shortcutIds)
  )

  ipcMain.handle('layout:get', () => accounts.getLayout())
  ipcMain.handle('bookmarks:list', (_e, accountId: string) => accounts.getBookmarks(accountId))
  ipcMain.handle('bookmarks:bar-visible', () => accounts.getBookmarksBarVisible())
  ipcMain.handle('bookmarks:chrome-profiles', () => accounts.getChromeProfiles())
  ipcMain.handle('bookmarks:import', (_e, accountId: string, chromeDir: string) =>
    accounts.importChromeBookmarks(accountId, chromeDir)
  )

  // ---- downloads (global list, shared across windows) ----
  ipcMain.handle('downloads:list', () => downloads.list())
  ipcMain.handle('downloads:open', (_e, id: string) => downloads.open(id))
  ipcMain.handle('downloads:show', (_e, id: string) => downloads.show(id))
  ipcMain.handle('downloads:cancel', (_e, id: string) => downloads.cancel(id))
  ipcMain.handle('downloads:clear', () => downloads.clear())

  // ---- preferences ----
  ipcMain.handle('prefs:get', () => prefs.state())
  ipcMain.handle('prefs:set', (_e, patch: Partial<Prefs>) => prefs.set(patch))
  ipcMain.handle('prefs:choose-downloads-dir', async (e) => {
    const win = winOf(e)
    if (!win) return ''
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: prefs.get().downloadsDir || app.getPath('downloads')
    })
    return result.canceled ? '' : (result.filePaths[0] ?? '')
  })
  ipcMain.handle('prefs:is-default-browser', () => app.isDefaultProtocolClient('http'))
  ipcMain.handle('prefs:make-default-browser', () => {
    app.setAsDefaultProtocolClient('http')
    app.setAsDefaultProtocolClient('https')
  })
  ipcMain.handle('extensions:list', (_e, accountId: string) => extensions.list(accountId))
  ipcMain.handle('extensions:uninstall', (_e, accountId: string, extensionId: string) =>
    extensions.uninstall(accountId, extensionId)
  )

  // ---- test-only (operate on session partitions directly) ----
  ipcMain.handle('__test:partitions', () => accounts.partitions())
  ipcMain.handle(
    '__test:set-cookie',
    (_e, arg: { partition: string; url: string; name: string; value: string }) =>
      session.fromPartition(arg.partition).cookies.set({
        url: arg.url,
        name: arg.name,
        value: arg.value
      })
  )
  ipcMain.handle('__test:get-cookies', async (_e, arg: { partition: string; url: string }) => {
    const cookies = await session.fromPartition(arg.partition).cookies.get({ url: arg.url })
    return cookies.map((c) => ({ name: c.name, value: c.value }))
  })
}
