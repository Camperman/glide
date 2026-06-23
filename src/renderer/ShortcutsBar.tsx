import type { Shortcut } from '../shared/types'

interface ShortcutsBarProps {
  shortcuts: Shortcut[]
  disabled: boolean
  onOpen: (url: string) => void
  onAdd: () => void
  onContextMenu: (shortcutId: string, x: number, y: number) => void
}

// Per-profile quick-launch row. Clicking a pill navigates the active account's
// view to that URL (stays in the same isolated session). Right-click a pill to
// edit/remove; [+] adds one. The set is specific to the active profile.
export function ShortcutsBar({
  shortcuts,
  disabled,
  onOpen,
  onAdd,
  onContextMenu
}: ShortcutsBarProps): JSX.Element {
  return (
    <div className="shortcuts" data-testid="shortcuts">
      {shortcuts.map((shortcut) => (
        <button
          key={shortcut.id}
          type="button"
          className="shortcut"
          title={shortcut.url}
          data-testid={`shortcut-${shortcut.id}`}
          disabled={disabled}
          onClick={() => onOpen(shortcut.url)}
          onContextMenu={(e) => {
            e.preventDefault()
            onContextMenu(shortcut.id, e.clientX, e.clientY)
          }}
        >
          {shortcut.label}
        </button>
      ))}
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
