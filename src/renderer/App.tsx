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
import { PreferencesDialog } from './PreferencesDialog'
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

  useEffect(() => {
    void window.glide.listAccounts().then(setAccounts)
    void window.glide.getActive().then(setActiveId)
    void window.glide.getNavState().then(setNav)
    void window.glide.getUnread().then(setUnread)
    void window.glide.getLayout().then(setLayout)
    void window.glide.getBookmarksBarVisible().then(setBookmarksBar)
    const offLayout = window.glide.onLayoutChanged(setLayout)
    const offBmVisible = window.glide.onBookmarksBarVisible(setBookmarksBar)
    const offBookmarks = window.glide.onBookmarksState(({ accountId, bookmarks: next }) =>
      setActiveId((current) => {
        if (accountId === current) setBookmarks(next)
        return current
      })
    )
    const offImport = window.glide.onImportBookmarks(() => setImportOpen(true))
    void window.glide.getDownloads().then(setDownloads)
    const offDownloads = window.glide.onDownloadsState(setDownloads)
    void window.glide.getPrefs().then(setPrefsState)
    const offPrefs = window.glide.onPrefsChanged(setPrefsState)
    const offOpenPrefs = window.glide.onOpenPreferences(() => setPrefsOpen(true))
    const offFindOpen = window.glide.onFindOpen(() => setFindOpen(true))
    const offFindClose = window.glide.onFindClose(() => setFindOpen(false))
    const offTarget = window.glide.onTargetUrl(setTargetUrl)
    const offActive = window.glide.onActiveChanged(setActiveId)
    const offNav = window.glide.onNavState(setNav)
    const offUnread = window.glide.onUnread(({ id, count }) =>
      setUnread((prev) => ({ ...prev, [id]: count }))
    )
    const offApps = window.glide.onAppsState(({ accountId, apps: next, activeShortcutId }) =>
      setActiveId((current) => {
        if (accountId === current) {
          setApps(next)
          setActiveApp(activeShortcutId)
        }
        return current
      })
    )
    const offTabs = window.glide.onTabsState(({ accountId, tabs: next }) =>
      setActiveId((current) => {
        if (accountId === current) setTabs(next)
        return current
      })
    )
    const offList = window.glide.onAccountsUpdated((next) => {
      setAccounts(next)
      setActiveId((current) =>
        current && next.some((a) => a.id === current) ? current : next[0]?.id
      )
    })
    const offEditAccount = window.glide.onEditAccount((id) => openEdit(id))
    const offEditShortcut = window.glide.onEditShortcut(({ shortcutId }) =>
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
      offTarget()
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
    void window.glide.getApps(activeId).then(({ apps: next, activeShortcutId }) => {
      setApps(next)
      setActiveApp(activeShortcutId)
    })
    void window.glide.getTabs(activeId).then(setTabs)
    void window.glide.getBookmarks(activeId).then(setBookmarks)
    void window.glide.listExtensions(activeId).then((list) => setHasExtensions(list.length > 0))
  }, [activeId])

  // Prefs dialog can install/uninstall extensions — refresh on close.
  useEffect(() => {
    if (!prefsOpen && activeId) {
      void window.glide.listExtensions(activeId).then((list) => setHasExtensions(list.length > 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsOpen])

  // A native view paints above DOM, so hide the active web view while a modal
  // is open and restore it when the modal closes.
  useEffect(() => {
    void window.glide.setOverlay(
      Boolean(dialog || shortcutDialog || importOpen || downloadsOpen || prefsOpen)
    )
  }, [dialog, shortcutDialog, importOpen, downloadsOpen, prefsOpen])

  // Theme: main owns resolution (nativeTheme + appearance pref) and pushes the
  // resolved dark/light with every prefs broadcast — one source of truth.
  useEffect(() => {
    if (!prefsState) return
    const root = document.documentElement
    root.dataset.profile = prefsState.prefs.themeId
    root.dataset.theme = prefsState.dark ? 'dark' : 'light'
  }, [prefsState])

  const handleSelect = (id: string): void => {
    setActiveId(id)
    void window.glide.switchAccount(id)
  }

  const handleSubmit = (values: DialogValues): void => {
    if (dialog?.mode === 'add') {
      void window.glide.addAccount({
        label: values.label,
        color: values.color,
        homeUrl: values.homeUrl || DEFAULT_HOME
      })
    } else if (dialog?.mode === 'edit' && dialog.id) {
      void window.glide.updateAccount(dialog.id, { label: values.label, color: values.color })
    }
    setDialog(null)
  }

  const openAdd = (): void =>
    setDialog({ mode: 'add', initial: { label: '', color: '#4c8bf5', homeUrl: DEFAULT_HOME } })

  const openEdit = (id: string): void => {
    void window.glide.listAccounts().then((list) => {
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
    void window.glide.getShortcuts(activeId).then((list) => {
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
      void window.glide.addShortcut(activeId, values)
    } else if (shortcutDialog?.mode === 'edit' && shortcutDialog.shortcutId) {
      void window.glide.updateShortcut(activeId, shortcutDialog.shortcutId, values)
    }
    setShortcutDialog(null)
  }

  const appRailProps = {
    apps,
    activeId: activeApp,
    disabled: !activeId,
    onOpen: (shortcutId: string) => {
      if (activeId) void window.glide.openShortcut(activeId, shortcutId)
    },
    onReorder: (shortcutIds: string[]) => {
      if (!activeId) return
      setApps((prev) => shortcutIds.map((id) => prev.find((a) => a.id === id)!).filter(Boolean))
      void window.glide.reorderShortcuts(activeId, shortcutIds)
    },
    onAdd: openAddShortcut,
    onContextMenu: (shortcutId: string) => {
      if (activeId) void window.glide.showShortcutMenu(activeId, shortcutId)
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
            if (activeId) void window.glide.activateTab(activeId, tabId)
          }}
          onClose={(tabId) => {
            if (activeId) void window.glide.closeTab(activeId, tabId)
          }}
          onReorder={(tabIds) => {
            if (!activeId) return
            setTabs((prev) => tabIds.map((id) => prev.find((t) => t.id === id)!).filter(Boolean))
            void window.glide.reorderTabs(activeId, tabIds)
          }}
          onToggleMute={(tabId) => {
            if (activeId) void window.glide.toggleTabMute(activeId, tabId)
          }}
          onNew={() => {
            if (activeId) void window.glide.newTab(activeId)
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
          onContextMenu={(id) => void window.glide.showAccountMenu(id)}
        />

        {layout === 'left' && <AppRail {...appRailProps} variant="rail" />}

        <div className="main-col">
          <TopBar
            nav={nav}
            partition={activeId ? `persist:account-${activeId}` : undefined}
            showActions={hasExtensions}
            onBack={() => void window.glide.goBack()}
            onForward={() => void window.glide.goForward()}
            onReload={() => void window.glide.reload()}
            onNavigate={(url) => void window.glide.navigate(url)}
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
                void window.glide.stopFind()
              }}
            />
          )}
          {bookmarksBar && (
            <BookmarksBar
              bookmarks={bookmarks}
              onOpen={(url) => {
                if (activeId) void window.glide.openBookmark(activeId, url)
              }}
              onOpenFolder={(folderId) => {
                if (activeId) void window.glide.openBookmarkFolder(activeId, folderId)
              }}
              onOpenOverflow={(ids) => {
                if (activeId) void window.glide.openBookmarksOverflow(activeId, ids)
              }}
            />
          )}
          <main className="content" data-testid="content">
            {accounts.length === 0 && (
              <div className="placeholder">
                <h1>Glide</h1>
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

      {prefsOpen && prefsState && (
        <PreferencesDialog
          prefs={prefsState.prefs}
          dark={prefsState.dark}
          accounts={accounts}
          activeAccountId={activeId}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {importOpen && (
        <ChromeImportDialog
          onImport={(chromeDir) => {
            if (activeId) void window.glide.importChromeBookmarks(activeId, chromeDir)
            setImportOpen(false)
          }}
          onCancel={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}
