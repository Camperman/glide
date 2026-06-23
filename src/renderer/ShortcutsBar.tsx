import type { Shortcut } from '../shared/types'

interface ShortcutsBarProps {
  shortcuts: Shortcut[]
  openIds: string[]
  activeId?: string
  disabled: boolean
  onOpen: (shortcutId: string) => void
  onClose: (shortcutId: string) => void
  onAdd: () => void
  onContextMenu: (shortcutId: string) => void
}

// Per-profile tab strip. Each pill is a service; clicking opens its tab the
// first time and just focuses it (no reload) thereafter. Open tabs stay live in
// the background; the active one is highlighted and shows an × to close/unload.
// Right-click a pill to edit/remove the shortcut. The set is per profile.
export function ShortcutsBar({
  shortcuts,
  openIds,
  activeId,
  disabled,
  onOpen,
  onClose,
  onAdd,
  onContextMenu
}: ShortcutsBarProps): JSX.Element {
  return (
    <div className="shortcuts" data-testid="shortcuts">
      {shortcuts.map((shortcut) => {
        const isOpen = openIds.includes(shortcut.id)
        const isActive = shortcut.id === activeId
        return (
          <span
            key={shortcut.id}
            className={`shortcut${isOpen ? ' shortcut--open' : ''}${
              isActive ? ' shortcut--active' : ''
            }`}
            data-testid={`shortcut-${shortcut.id}`}
          >
            <button
              type="button"
              className="shortcut__label"
              title={shortcut.url}
              disabled={disabled}
              onClick={() => onOpen(shortcut.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onContextMenu(shortcut.id)
              }}
            >
              {shortcut.label}
            </button>
            {isOpen && (
              <button
                type="button"
                className="shortcut__close"
                title="Close tab"
                aria-label={`Close ${shortcut.label}`}
                data-testid={`close-${shortcut.id}`}
                onClick={() => onClose(shortcut.id)}
              >
                ×
              </button>
            )}
          </span>
        )
      })}
      <button
        type="button"
        className="shortcut shortcut--add"
        title="Add shortcut"
        data-testid="add-shortcut"
        disabled={disabled}
        onClick={onAdd}
      >
        +
      </button>
    </div>
  )
}
