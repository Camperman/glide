import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { TabStrip } from './TabStrip'
import { AppRail } from './AppRail'
import { BookmarksBar } from './BookmarksBar'
import { ChromeImportDialog } from './ChromeImportDialog'
import { AccountDialog, type DialogValues } from './AccountDialog'
import { ShortcutDialog, type ShortcutValues } from './ShortcutDialog'
import { Downloads } from './Downloads'
import { FindBar } from './FindBar'
import { HistoryDialog } from './HistoryDialog'
import { Palette } from './Palette'
import { PreferencesDialog } from './PreferencesDialog'
import { WelcomeDialog } from './WelcomeDialog'
import type {
  AccountSummary,
  AppInfo,
  AppRailLayout,
  BookmarkNode,
  DownloadInfo,
  NavState,
  PrefsState,
  TabInfo
} from '../shared/types'

interface DialogState {
  mode: 'add' | 'edit'
  id?: string
  initial: DialogValues
}

interface ShortcutDialogState {
  mode: 'add' | 'edit'
  shortcutId?: string
  initial: ShortcutValues
}

interface BookmarkDialogState {
  accountId: string
  bookmarkId: string
  initial: ShortcutValues
}

const DEFAULT_HOME = 'https://mail.google.com'

export function App(): JSX.Element {
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [activeId, setActiveId] = useState<string | undefined>()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [nav, setNav] = useState<NavState | null>(null)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [apps, setApps] = useState<AppInfo[]>([])
  const [activeApp, setActiveApp] = useState<string | undefined>()
  const [shortcutDialog, setShortcutDialog] = useState<ShortcutDialogState | null>(null)
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [layout, setLayout] = useState<AppRailLayout>('left')
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([])
  const [bookmarksBar, setBookmarksBar] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const [prefsState, setPrefsState] = useState<PrefsState | null>(null)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [hasExtensions, setHasExtensions] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [bookmarkDialog, setBookmarkDialog] = useState<BookmarkDialogState | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    void window.flit.listAccounts().then(setAccounts)
    void window.flit.getActive().then(setActiveId)
    void window.flit.getNavState().then(setNav)
    void window.flit.getUnread().then(setUnread)
    void window.flit.getLayout().then(setLayout)
    void window.flit.getBookmarksBarVisible().then(setBookmarksBar)
    const offLayout = window.flit.onLayoutChanged(setLayout)
    const offBmVisible = window.flit.onBookmarksBarVisible(setBookmarksBar)
    const offBookmarks = window.flit.onBookmarksState(({ accountId, bookmarks: next }) =>
      setActiveId((current) => {
        if (accountId === current) setBookmarks(next)
        return current
      })
    )
    const offImport = window.flit.onImportBookmarks(() => setImportOpen(true))
    void window.flit.getDownloads().then(setDownloads)
    const offDownloads = window.flit.onDownloadsState(setDownloads)
    void window.flit.isFirstRun().then(setWelcomeOpen)
    void window.flit.getPrefs().then(setPrefsState)
    const offPrefs = window.flit.onPrefsChanged(setPrefsState)
    const offOpenPrefs = window.flit.onOpenPreferences(() => setPrefsOpen(true))
    const offFindOpen = window.flit.onFindOpen(() => setFindOpen(true))
    const offHistory = window.flit.onOpenHistory(() => setHistoryOpen(true))
    const offPalette = window.flit.onOpenPalette(() => setPaletteOpen(true))
    const offFindClose = window.flit.onFindClose(() => setFindOpen(false))
    const offTarget = window.flit.onTargetUrl(setTargetUrl)
    const offActive = window.flit.onActiveChanged(setActiveId)
    const offNav = window.flit.onNavState(setNav)
    const offUnread = window.flit.onUnread(({ id, count }) =>
      setUnread((prev) => ({ ...prev, [id]: count }))
    )
    const offApps = window.flit.onAppsState(({ accountId, apps: next, activeShortcutId }) =>
      setActiveId((current) => {
        if (accountId === current) {
          setApps(next)
          setActiveApp(activeShortcutId)
        }
        return current
      })
    )
    const offTabs = window.flit.onTabsState(({ accountId, tabs: next }) =>
      setActiveId((current) => {
        if (accountId === current) setTabs(next)
        return current
      })
    )
    const offList = window.flit.onAccountsUpdated((next) => {
      setAccounts(next)
      setActiveId((current) =>
        current && next.some((a) => a.id === current) ? current : next[0]?.id
      )
    })
    const offEditBookmark = window.flit.onEditBookmark(({ accountId, bookmarkId }) => {
      void window.flit.getBookmarks(accountId).then((nodes) => {
        const flat: Array<{ id: string; title: string; url: string }> = []
        const walk = (list: typeof nodes): void => {
          for (const n of list) {
            if (n.type === 'link') flat.push(n)
            else walk(n.children)
          }
        }
        walk(nodes)
        const link = flat.find((l) => l.id === bookmarkId)
        if (link) {
          setBookmarkDialog({
            accountId,
            bookmarkId,
            initial: { label: link.title, url: link.url }
          })
        }
      })
    })
    const offEditAccount = window.flit.onEditAccount((id) => openEdit(id))
    const offEditShortcut = window.flit.onEditShortcut(({ shortcutId }) =>
      openEditShortcut(shortcutId)
    )
    return () => {
      offActive()
      offNav()
      offUnread()
      offApps()
      offTabs()
      offList()
      offLayout()
      offBmVisible()
      offBookmarks()
      offImport()
      offDownloads()
      offPrefs()
      offOpenPrefs()
      offFindOpen()
      offFindClose()
      offHistory()
      offPalette()
      offTarget()
      offEditBookmark()
      offEditAccount()
      offEditShortcut()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the active profile's apps + tab state when the active account changes.
  useEffect(() => {
    if (!activeId) {
      setApps([])
      setActiveApp(undefined)
      setTabs([])
      return
    }
    void window.flit.getApps(activeId).then(({ apps: next, activeShortcutId }) => {
      setApps(next)
      setActiveApp(activeShortcutId)
    })
    void window.flit.getTabs(activeId).then(setTabs)
    void window.flit.getBookmarks(activeId).then(setBookmarks)
    void window.flit.listExtensions(activeId).then((list) => setHasExtensions(list.length > 0))
  }, [activeId])

  // Prefs dialog can install/uninstall extensions — refresh on close.
  useEffect(() => {
    if (!prefsOpen && activeId) {
      void window.flit.listExtensions(activeId).then((list) => setHasExtensions(list.length > 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsOpen])

  // A native view paints above DOM, so hide the active web view while a modal
  // is open and restore it when the modal closes.
  useEffect(() => {
    void window.flit.setOverlay(
      Boolean(
        dialog ||
          shortcutDialog ||
          bookmarkDialog ||
          importOpen ||
          downloadsOpen ||
          prefsOpen ||
          historyOpen ||
          welcomeOpen ||
          paletteOpen
      )
    )
  }, [
    dialog,
    shortcutDialog,
    bookmarkDialog,
    importOpen,
    downloadsOpen,
    prefsOpen,
    historyOpen,
    welcomeOpen,
    paletteOpen
  ])

  // Theme: main owns resolution (nativeTheme + appearance pref) and pushes the
  // resolved dark/light with every prefs broadcast — one source of truth.
  useEffect(() => {
    if (!prefsState) return
    const root = document.documentElement
    root.dataset.profile = prefsState.prefs.themeId
    root.dataset.theme = prefsState.dark ? 'dark' : 'light'
  }, [prefsState])

  // Accent follows the active account's color (pref, default on) — a constant
  // "which account am I in" signal across the chrome.
  useEffect(() => {
    const root = document.documentElement
    const color = accounts.find((a) => a.id === activeId)?.color
    if (prefsState?.prefs.accountAccent && color) {
      root.style.setProperty('--accent', color)
    } else {
      root.style.removeProperty('--accent') // fall back to the profile's accent
    }
  }, [prefsState, accounts, activeId])

  const handleSelect = (id: string): void => {
    setActiveId(id)
    void window.flit.switchAccount(id)
  }

  const handleSubmit = (values: DialogValues): void => {
    if (dialog?.mode === 'add') {
      void window.flit.addAccount({
        label: values.label,
        color: values.color,
        homeUrl: values.homeUrl || DEFAULT_HOME
      })
    } else if (dialog?.mode === 'edit' && dialog.id) {
      void window.flit.updateAccount(dialog.id, { label: values.label, color: values.color })
    }
    setDialog(null)
  }

  const openAdd = (): void =>
    setDialog({ mode: 'add', initial: { label: '', color: '#4c8bf5', homeUrl: DEFAULT_HOME } })

  const openEdit = (id: string): void => {
    void window.flit.listAccounts().then((list) => {
      const account = list.find((a) => a.id === id)
      if (!account) return
      setDialog({
        mode: 'edit',
        id,
        initial: { label: account.label, color: account.color, homeUrl: DEFAULT_HOME }
      })
    })
  }

  const openAddShortcut = (): void =>
    setShortcutDialog({ mode: 'add', initial: { label: '', url: 'https://' } })

  const openEditShortcut = (shortcutId: string): void => {
    if (!activeId) return
    void window.flit.getShortcuts(activeId).then((list) => {
      const shortcut = list.find((s) => s.id === shortcutId)
      if (!shortcut) return
      setShortcutDialog({
        mode: 'edit',
        shortcutId,
        initial: { label: shortcut.label, url: shortcut.url }
      })
    })
  }

  const handleShortcutSubmit = (values: ShortcutValues): void => {
    if (!activeId) return
    if (shortcutDialog?.mode === 'add') {
      void window.flit.addShortcut(activeId, values)
    } else if (shortcutDialog?.mode === 'edit' && shortcutDialog.shortcutId) {
      void window.flit.updateShortcut(activeId, shortcutDialog.shortcutId, values)
    }
    setShortcutDialog(null)
  }

  const appRailProps = {
    apps,
    activeId: activeApp,
    disabled: !activeId,
    onOpen: (shortcutId: string) => {
      if (activeId) void window.flit.openShortcut(activeId, shortcutId)
    },
    onReorder: (shortcutIds: string[]) => {
      if (!activeId) return
      setApps((prev) => shortcutIds.map((id) => prev.find((a) => a.id === id)!).filter(Boolean))
      void window.flit.reorderShortcuts(activeId, shortcutIds)
    },
    onAdd: openAddShortcut,
    onContextMenu: (shortcutId: string) => {
      if (activeId) void window.flit.showShortcutMenu(activeId, shortcutId)
    }
  }

  return (
    <div className="app">
      <div className="titlebar" data-testid="titlebar">
        <div className="titlebar__lights" />
        <TabStrip
          tabs={tabs}
          disabled={!activeId}
          onActivate={(tabId) => {
            if (activeId) void window.flit.activateTab(activeId, tabId)
          }}
          onClose={(tabId) => {
            if (activeId) void window.flit.closeTab(activeId, tabId)
          }}
          onReorder={(tabIds) => {
            if (!activeId) return
            setTabs((prev) => tabIds.map((id) => prev.find((t) => t.id === id)!).filter(Boolean))
            void window.flit.reorderTabs(activeId, tabIds)
          }}
          onToggleMute={(tabId) => {
            if (activeId) void window.flit.toggleTabMute(activeId, tabId)
          }}
          onContextMenu={(tabId) => {
            if (activeId) void window.flit.showTabMenu(activeId, tabId)
          }}
          onNew={() => {
            if (activeId) void window.flit.newTab(activeId)
          }}
        />
        {layout === 'top' && <AppRail {...appRailProps} variant="top" />}
      </div>

      <div className="body">
        <Sidebar
          accounts={accounts}
          activeId={activeId}
          unread={unread}
          onSelect={handleSelect}
          onAdd={openAdd}
          onOpenPreferences={() => setPrefsOpen(true)}
          onContextMenu={(id) => void window.flit.showAccountMenu(id)}
        />

        {layout === 'left' && <AppRail {...appRailProps} variant="rail" />}

        <div className="main-col">
          <TopBar
            nav={nav}
            partition={
              activeId
                ? activeId.startsWith('incognito-')
                  ? activeId // memory-only partition (no persist: prefix)
                  : `persist:account-${activeId}`
                : undefined
            }
            showActions={hasExtensions}
            onBack={() => void window.flit.goBack()}
            onForward={() => void window.flit.goForward()}
            onReload={() => void window.flit.reload()}
            onNavigate={(url) => void window.flit.navigate(url)}
          >
            {targetUrl && <span className="topbar__target">{targetUrl}</span>}
            <Downloads
              downloads={downloads}
              open={downloadsOpen}
              onToggle={() => setDownloadsOpen((v) => !v)}
              onClose={() => setDownloadsOpen(false)}
            />
          </TopBar>
          {findOpen && (
            <FindBar
              onClose={() => {
                setFindOpen(false)
                void window.flit.stopFind()
              }}
            />
          )}
          {bookmarksBar && (
            <BookmarksBar
              bookmarks={bookmarks}
              onOpen={(url) => {
                if (activeId) void window.flit.openBookmark(activeId, url)
              }}
              onOpenFolder={(folderId) => {
                if (activeId) void window.flit.openBookmarkFolder(activeId, folderId)
              }}
              onOpenOverflow={(ids) => {
                if (activeId) void window.flit.openBookmarksOverflow(activeId, ids)
              }}
              onContextMenu={(bookmarkId) => {
                if (activeId) void window.flit.showBookmarkMenu(activeId, bookmarkId)
              }}
            />
          )}
          <main className="content" data-testid="content">
            {accounts.length === 0 && (
              <div className="placeholder">
                <h1>Flit</h1>
                <p>No accounts yet — click the + to add one.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {dialog && (
        <AccountDialog
          mode={dialog.mode}
          initial={dialog.initial}
          onSubmit={handleSubmit}
          onCancel={() => setDialog(null)}
        />
      )}

      {shortcutDialog && (
        <ShortcutDialog
          mode={shortcutDialog.mode}
          initial={shortcutDialog.initial}
          onSubmit={handleShortcutSubmit}
          onCancel={() => setShortcutDialog(null)}
        />
      )}

      {bookmarkDialog && (
        <ShortcutDialog
          mode="edit"
          initial={bookmarkDialog.initial}
          onSubmit={(values) => {
            void window.flit.updateBookmark(bookmarkDialog.accountId, bookmarkDialog.bookmarkId, {
              title: values.label,
              url: values.url
            })
            setBookmarkDialog(null)
          }}
          onCancel={() => setBookmarkDialog(null)}
        />
      )}

      {paletteOpen && (
        <Palette
          accounts={accounts.filter((a) => !a.ephemeral)}
          activeId={activeId}
          tabs={tabs}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {welcomeOpen && accounts[0] && (
        <WelcomeDialog
          initialLabel={accounts[0].label}
          onDone={(label, color) => {
            void window.flit.updateAccount(accounts[0].id, { label, color })
            void window.flit.completeFirstRun()
            setWelcomeOpen(false)
          }}
        />
      )}

      {historyOpen && activeId && (
        <HistoryDialog
          accountId={activeId}
          accountLabel={accounts.find((a) => a.id === activeId)?.label ?? ''}
          onOpenUrl={(url) => void window.flit.openBookmark(activeId, url)}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {prefsOpen && prefsState && (
        <PreferencesDialog
          prefs={prefsState.prefs}
          layout={layout}
          dark={prefsState.dark}
          accounts={accounts}
          activeAccountId={activeId}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {importOpen && (
        <ChromeImportDialog
          onImport={(chromeDir) => {
            if (activeId) void window.flit.importChromeBookmarks(activeId, chromeDir)
            setImportOpen(false)
          }}
          onCancel={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}
