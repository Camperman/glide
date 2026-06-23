import type { AppInfo } from '../shared/types'

interface AppRailProps {
  apps: AppInfo[]
  activeId?: string
  disabled: boolean
  onOpen: (shortcutId: string) => void
  onAdd: () => void
  onContextMenu: (shortcutId: string) => void
}

// Vertical app rail (Shift-style) between the profile avatars and the page.
// Each app shows its favicon, a short label, and an unread badge; clicking
// opens/focuses that app's tab. Right-click to edit/remove; [+] adds an app.
export function AppRail({
  apps,
  activeId,
  disabled,
  onOpen,
  onAdd,
  onContextMenu
}: AppRailProps): JSX.Element {
  return (
    <nav className="apprail" data-testid="apprail" aria-label="Apps">
      {apps.map((app) => (
        <button
          key={app.id}
          type="button"
          className={`apprail__item${app.id === activeId ? ' apprail__item--active' : ''}`}
          title={app.label}
          data-testid={`app-${app.id}`}
          disabled={disabled}
          onClick={() => onOpen(app.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            onContextMenu(app.id)
          }}
        >
          <span className="apprail__icon">
            {app.favicon ? (
              <img src={app.favicon} alt="" />
            ) : (
              app.label.charAt(0).toUpperCase()
            )}
            {app.unread > 0 && (
              <span className="apprail__badge" data-testid={`app-badge-${app.id}`}>
                {app.unread > 99 ? '99+' : app.unread}
              </span>
            )}
          </span>
          <span className="apprail__label">{app.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="apprail__add"
        title="Add app"
        data-testid="add-shortcut"
        disabled={disabled}
        onClick={onAdd}
      >
        +
      </button>
    </nav>
  )
}
