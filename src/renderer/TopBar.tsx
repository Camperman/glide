import { useEffect, useState, type FormEvent } from 'react'
import type { NavState } from '../shared/types'

interface TopBarProps {
  nav: NavState | null
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onNavigate: (url: string) => void
}

// Slim browser chrome above the active account view: back / forward / reload
// and an editable address field reflecting the active view's URL.
export function TopBar({ nav, onBack, onForward, onReload, onNavigate }: TopBarProps): JSX.Element {
  const [value, setValue] = useState(nav?.url ?? '')

  // Follow the active view's URL as it navigates / switches accounts or tabs.
  useEffect(() => {
    setValue(nav?.url ?? '')
  }, [nav?.url, nav?.accountId, nav?.tabId])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (value.trim()) onNavigate(value.trim())
  }

  return (
    <div className="topbar" data-testid="topbar">
      <button
        type="button"
        className="topbar__btn"
        title="Back"
        disabled={!nav?.canGoBack}
        onClick={onBack}
      >
        ‹
      </button>
      <button
        type="button"
        className="topbar__btn"
        title="Forward"
        disabled={!nav?.canGoForward}
        onClick={onForward}
      >
        ›
      </button>
      <button
        type="button"
        className="topbar__btn"
        title="Reload"
        disabled={!nav}
        onClick={onReload}
      >
        ⟳
      </button>
      <form className="topbar__address" onSubmit={submit}>
        <input
          type="text"
          value={value}
          spellCheck={false}
          placeholder="Enter a URL"
          disabled={!nav}
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
    </div>
  )
}
