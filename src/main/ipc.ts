import { ipcMain, session } from 'electron'
import type { AccountManager } from './accounts'
import type {
  AccountPatch,
  NewAccountInput,
  ShortcutInput,
  ShortcutPatch
} from '../shared/types'

/**
 * Wire the renderer ↔ main IPC for account listing and switching, plus the
 * test-only channels used by tests/isolation.spec.ts. Test channels operate
 * directly on session partitions, so they work without any page being loaded.
 */
export function registerIpc(accounts: AccountManager): void {
  ipcMain.handle('accounts:list', () => accounts.summaries())
  ipcMain.handle('accounts:active', () => accounts.getActiveId())
  ipcMain.handle('accounts:switch', (_event, id: string) => accounts.setActive(id))
  ipcMain.handle('accounts:add', (_event, input: NewAccountInput) => {
    accounts.addAccount(input)
  })
  ipcMain.handle('accounts:update', (_event, id: string, patch: AccountPatch) =>
    accounts.updateAccount(id, patch)
  )
  ipcMain.handle('accounts:remove', (_event, id: string) => accounts.removeAccount(id))

  ipcMain.handle('nav:back', () => accounts.goBack())
  ipcMain.handle('nav:forward', () => accounts.goForward())
  ipcMain.handle('nav:reload', () => accounts.reload())
  ipcMain.handle('nav:go', (_event, url: string) => accounts.navigate(url))
  ipcMain.handle('nav:state', () => accounts.getActiveNavState())

  ipcMain.handle('accounts:unread-all', () => accounts.unreadAll())

  ipcMain.handle('shortcuts:list', (_event, accountId: string) =>
    accounts.shortcutsFor(accountId)
  )
  ipcMain.handle('apps:list', (_event, accountId: string) => accounts.getApps(accountId))
  ipcMain.handle('layout:get', () => accounts.getLayout())

  ipcMain.handle('bookmarks:list', (_event, accountId: string) => accounts.getBookmarks(accountId))
  ipcMain.handle('bookmarks:open', (_event, accountId: string, url: string) =>
    accounts.openBookmark(accountId, url)
  )
  ipcMain.handle('bookmarks:open-folder', (_event, accountId: string, folderId: string) =>
    accounts.openBookmarkFolder(accountId, folderId)
  )
  ipcMain.handle('bookmarks:bar-visible', () => accounts.getBookmarksBarVisible())
  ipcMain.handle('bookmarks:chrome-profiles', () => accounts.getChromeProfiles())
  ipcMain.handle('bookmarks:import', (_event, accountId: string, chromeDir: string) =>
    accounts.importChromeBookmarks(accountId, chromeDir)
  )
  ipcMain.handle('shortcuts:add', (_event, accountId: string, input: ShortcutInput) =>
    accounts.addShortcut(accountId, input)
  )
  ipcMain.handle(
    'shortcuts:update',
    (_event, accountId: string, shortcutId: string, patch: ShortcutPatch) =>
      accounts.updateShortcut(accountId, shortcutId, patch)
  )
  ipcMain.handle('shortcuts:remove', (_event, accountId: string, shortcutId: string) =>
    accounts.removeShortcut(accountId, shortcutId)
  )

  ipcMain.handle('menu:account', (_event, accountId: string) =>
    accounts.popupAccountMenu(accountId)
  )
  ipcMain.handle('menu:shortcut', (_event, accountId: string, shortcutId: string) =>
    accounts.popupShortcutMenu(accountId, shortcutId)
  )
  ipcMain.handle('chrome:overlay', (_event, open: boolean) => accounts.setOverlayOpen(open))

  ipcMain.handle('tabs:open-shortcut', (_event, accountId: string, shortcutId: string) =>
    accounts.openShortcut(accountId, shortcutId)
  )
  ipcMain.handle('tabs:new', (_event, accountId: string) => accounts.newTab(accountId))
  ipcMain.handle('tabs:activate', (_event, accountId: string, tabId: string) =>
    accounts.activateTab(accountId, tabId)
  )
  ipcMain.handle('tabs:close', (_event, accountId: string, tabId: string) =>
    accounts.closeTab(accountId, tabId)
  )
  ipcMain.handle('tabs:reorder', (_event, accountId: string, tabIds: string[]) =>
    accounts.reorderTabs(accountId, tabIds)
  )
  ipcMain.handle('tabs:list', (_event, accountId: string) => accounts.getTabs(accountId))

  ipcMain.handle('__test:partitions', () => accounts.partitions())

  ipcMain.handle(
    '__test:set-cookie',
    (_event, arg: { partition: string; url: string; name: string; value: string }) =>
      session.fromPartition(arg.partition).cookies.set({
        url: arg.url,
        name: arg.name,
        value: arg.value
      })
  )

  ipcMain.handle(
    '__test:get-cookies',
    async (_event, arg: { partition: string; url: string }) => {
      const cookies = await session.fromPartition(arg.partition).cookies.get({ url: arg.url })
      return cookies.map((c) => ({ name: c.name, value: c.value }))
    }
  )
}
