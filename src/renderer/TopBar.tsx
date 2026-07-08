import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { NavState } from '../shared/types'

interface TopBarProps {
  nav: NavState | null
  /** Active account's session partition — hosts the extension toolbar. */
  partition?: string
  /** Render the extension toolbar chip (the account has extensions). */
  showActions?: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onNavigate: (url: string) => void
  /** Trailing controls after the address field (e.g. the downloads button). */
  children?: ReactNode
}

// Slim browser chrome above the active account view: back / forward / reload
// and an editable address field reflecting the active view's URL.
export function TopBar({
  nav,
  partition,
  showActions,
  onBack,
  onForward,
  onReload,
  onNavigate,
  children
}: TopBarProps): JSX.Element {
  const [value, setValue] = useState(nav?.url ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Follow the active view's URL as it navigates / switches accounts or tabs.
  useEffect(() => {
    setValue(nav?.url ?? '')
  }, [nav?.url, nav?.accountId, nav?.tabId])

  // Cmd-L: focus + select the address field.
  useEffect(() => {
    return window.glide.onFocusAddress(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void window.glide.omniboxHide()
    if (value.trim()) onNavigate(value.trim())
  }

  const onType = (next: string): void => {
    setValue(next)
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) {
      void window.glide.omniboxInput(next, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      void window.glide.omniboxNav(e.key === 'ArrowDown' ? 1 : -1).then((fill) => {
        if (fill !== undefined) setValue(fill)
      })
    } else if (e.key === 'Escape') {
      void window.glide.omniboxHide()
    }
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
          ref={inputRef}
          type="text"
          value={value}
          spellCheck={false}
          placeholder="Search or enter a URL"
          disabled={!nav}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Delay so a mousedown on a suggestion lands before the dropdown
            // is dismissed (the dropdown is a separate native view).
            setTimeout(() => void window.glide.omniboxHide(), 150)
          }}
        />
      </form>
      {partition && showActions && (
        <browser-action-list class="topbar__actions" partition={partition} />
      )}
      {children}
    </div>
  )
}
