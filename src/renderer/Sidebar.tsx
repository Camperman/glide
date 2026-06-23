import type { CSSProperties } from 'react'
import type { AccountSummary } from '../shared/types'

interface SidebarProps {
  accounts: AccountSummary[]
  activeId?: string
  unread: Record<string, number>
  onSelect: (id: string) => void
  onAdd: () => void
  onContextMenu: (id: string) => void
}

// Left rail of account avatars with unread badges. Click switches; right-click
// opens edit/remove.
export function Sidebar({
  accounts,
  activeId,
  unread,
  onSelect,
  onAdd,
  onContextMenu
}: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar" data-testid="sidebar" aria-label="Accounts">
      <div className="sidebar__brand" title="Glide">
        G
      </div>
      <div className="sidebar__accounts">
        {accounts.map((account) => {
          const count = unread[account.id] ?? 0
          return (
            <div key={account.id} className="account-slot">
              <button
                type="button"
                className={`account${account.id === activeId ? ' account--active' : ''}`}
                style={{ '--account-color': account.color } as CSSProperties}
                title={account.label}
                data-testid={`account-${account.id}`}
                aria-pressed={account.id === activeId}
                onClick={() => onSelect(account.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onContextMenu(account.id)
                }}
              >
                {account.label.charAt(0).toUpperCase()}
              </button>
              {count > 0 && (
                <span className="account__badge" data-testid={`badge-${account.id}`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <button
        className="sidebar__add"
        type="button"
        title="Add account"
        data-testid="add-account"
        onClick={onAdd}
      >
        +
      </button>
    </nav>
  )
}
