import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ShortcutsBar } from './ShortcutsBar'
import { AccountDialog, type DialogValues } from './AccountDialog'
import { ShortcutDialog, type ShortcutValues } from './ShortcutDialog'
import type { AccountSummary, NavState, Shortcut } from '../shared/types'

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
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])
  const [shortcutDialog, setShortcutDialog] = useState<ShortcutDialogState | null>(null)

  useEffect(() => {
    void window.glide.listAccounts().then(setAccounts)
    void window.glide.getActive().then(setActiveId)
    void window.glide.getNavState().then(setNav)
    void window.glide.getUnread().then(setUnread)
    const offActive = window.glide.onActiveChanged(setActiveId)
    const offNav = window.glide.onNavState(setNav)
    const offUnread = window.glide.onUnread(({ id, count }) =>
      setUnread((prev) => ({ ...prev, [id]: count }))
    )
    const offShortcuts = window.glide.onShortcutsUpdated(({ accountId, shortcuts: next }) =>
      setActiveId((current) => {
        if (accountId === current) setShortcuts(next)
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
      offShortcuts()
      offList()
      offEditAccount()
      offEditShortcut()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the active profile's shortcuts whenever the active account changes.
  useEffect(() => {
    if (activeId) void window.glide.getShortcuts(activeId).then(setShortcuts)
    else setShortcuts([])
  }, [activeId])

  // A native view paints above DOM, so hide the active web view while a modal
  // is open and restore it when the modal closes.
  useEffect(() => {
    void window.glide.setOverlay(Boolean(dialog || shortcutDialog))
  }, [dialog, shortcutDialog])

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

  return (
    <div className="app">
      <Sidebar
        accounts={accounts}
        activeId={activeId}
        unread={unread}
        onSelect={handleSelect}
        onAdd={openAdd}
        onContextMenu={(id) => void window.glide.showAccountMenu(id)}
      />

      <div className="main-col">
        <TopBar
          nav={nav}
          onBack={() => void window.glide.goBack()}
          onForward={() => void window.glide.goForward()}
          onReload={() => void window.glide.reload()}
          onNavigate={(url) => void window.glide.navigate(url)}
        />
        <ShortcutsBar
          shortcuts={shortcuts}
          disabled={!activeId}
          onOpen={(url) => void window.glide.navigate(url)}
          onAdd={openAddShortcut}
          onContextMenu={(shortcutId) => {
            if (activeId) void window.glide.showShortcutMenu(activeId, shortcutId)
          }}
        />
        <main className="content" data-testid="content">
          {accounts.length === 0 && (
            <div className="placeholder">
              <h1>Glide</h1>
              <p>No accounts yet — click the + to add one.</p>
            </div>
          )}
        </main>
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
    </div>
  )
}
