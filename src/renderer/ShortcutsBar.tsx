import type { Shortcut } from '../shared/types'

interface ShortcutsBarProps {
  shortcuts: Shortcut[]
  disabled: boolean
  onOpen: (shortcutId: string) => void
  onAdd: () => void
  onContextMenu: (shortcutId: string) => void
}

// Per-profile bookmarks bar. Clicking a bookmark focuses its tab if already
// open, else opens a new tab for it. Right-click to edit/remove; [+] adds one.
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
          onClick={() => onOpen(shortcut.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            onContextMenu(shortcut.id)
          }}
        >
          {shortcut.label}
        </button>
      ))}
      <button
        type="button"
        className="shortcut shortcut--add"
        title="Add bookmark"
        data-testid="add-shortcut"
        disabled={disabled}
        onClick={onAdd}
      >
        +
      </button>
    </div>
  )
}
