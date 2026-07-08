import { useRef, useState } from 'react'
import type { AppInfo } from '../shared/types'

interface AppRailProps {
  apps: AppInfo[]
  activeId?: string
  disabled: boolean
  /** 'rail' = vertical left column (favicon + label); 'top' = compact icon row. */
  variant: 'rail' | 'top'
  onOpen: (shortcutId: string) => void
  onReorder: (shortcutIds: string[]) => void
  onAdd: () => void
  onContextMenu: (shortcutId: string) => void
}

// The app launcher. In 'rail' mode it's a vertical column between the profile
// avatars and the page (favicon + label + badge); in 'top' mode it's a compact
// icon row pinned to the right of the title bar. Clicking opens/focuses the
// app's tab; right-click to edit/remove; [+] adds an app.
export function AppRail({
  apps,
  activeId,
  disabled,
  variant,
  onOpen,
  onReorder,
  onAdd,
  onContextMenu
}: AppRailProps): JSX.Element {
  const dragId = useRef<string | null>(null)
  const [order, setOrder] = useState<AppInfo[] | null>(null)
  const shown = order ?? apps

  const onDragStart = (id: string): void => {
    dragId.current = id
    setOrder(apps)
  }
  const onDragOver = (overId: string): void => {
    const current = order ?? apps
    const from = current.findIndex((a) => a.id === dragId.current)
    const to = current.findIndex((a) => a.id === overId)
    if (from === -1 || to === -1 || from === to) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
  }
  const onDragEnd = (): void => {
    if (order) onReorder(order.map((a) => a.id))
    dragId.current = null
    setOrder(null)
  }

  return (
    <nav
      className={`apprail${variant === 'top' ? ' apprail--top' : ''}`}
      data-testid="apprail"
      aria-label="Apps"
    >
      {shown.map((app) => (
        <button
          key={app.id}
          type="button"
          className={`apprail__item${app.id === activeId ? ' apprail__item--active' : ''}`}
          title={app.label}
          data-testid={`app-${app.id}`}
          disabled={disabled}
          draggable
          onClick={() => onOpen(app.id)}
          onDragStart={() => onDragStart(app.id)}
          onDragOver={(e) => {
            e.preventDefault()
            onDragOver(app.id)
          }}
          onDragEnd={onDragEnd}
          onDrop={onDragEnd}
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
            {app.audible && (
              <span className="apprail__audio" title="Playing audio">
                🔊
              </span>
            )}
          </span>
          {variant === 'rail' && <span className="apprail__label">{app.label}</span>}
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
