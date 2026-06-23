import { useState, type FormEvent } from 'react'

export interface ShortcutValues {
  label: string
  url: string
}

interface ShortcutDialogProps {
  mode: 'add' | 'edit'
  initial: ShortcutValues
  onSubmit: (values: ShortcutValues) => void
  onCancel: () => void
}

// Modal for adding or editing a per-profile shortcut (label + URL).
export function ShortcutDialog({
  mode,
  initial,
  onSubmit,
  onCancel
}: ShortcutDialogProps): JSX.Element {
  const [label, setLabel] = useState(initial.label)
  const [url, setUrl] = useState(initial.url)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (label.trim() && url.trim()) onSubmit({ label, url })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{mode === 'add' ? 'Add shortcut' : 'Edit shortcut'}</h2>

        <label className="field">
          <span>Label</span>
          <input
            type="text"
            value={label}
            autoFocus
            placeholder="Calendar, Drive…"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>

        <label className="field">
          <span>URL</span>
          <input
            type="text"
            value={url}
            placeholder="https://calendar.google.com"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            {mode === 'add' ? 'Add' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
