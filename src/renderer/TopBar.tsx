import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { NavState } from '../shared/types'

interface TopBarProps {
  nav: NavState | null
  /** Active account's session partition — hosts the extension toolbar. */
  partition?: string
  /** Render the extension toolbar chip (the account has extensions). */
  showActions?: boolean
  /** Open the puzzle-piece extensions menu for the active account. */
  onExtensionsMenu: () => void
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
  onExtensionsMenu,
  onBack,
  onForward,
  onReload,
  onNavigate,
  children
}: TopBarProps): JSX.Element {
  const [value, setValue] = useState(nav?.url ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const blank = nav?.blank ?? false

  // Follow the active view's URL as it navigates / switches accounts or tabs.
  // A blank new tab shows an empty field (the page loads the new-tab home, but
  // the address bar stays empty so you can type any destination).
  useEffect(() => {
    setValue(blank ? '' : (nav?.url ?? ''))
  }, [nav?.url, nav?.accountId, nav?.tabId, blank])

  // Land the cursor in the address bar when a blank new tab becomes active.
  useEffect(() => {
    if (blank) inputRef.current?.focus()
  }, [blank, nav?.tabId])

  // Cmd-L: focus + select the address field.
  useEffect(() => {
    return window.flit.onFocusAddress(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void window.flit.omniboxHide()
    if (value.trim()) onNavigate(value.trim())
  }

  const onType = (next: string): void => {
    setValue(next)
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) {
      void window.flit.omniboxInput(next, {
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
      void window.flit.omniboxNav(e.key === 'ArrowDown' ? 1 : -1).then((fill) => {
        if (fill !== undefined) setValue(fill)
      })
    } else if (e.key === 'Escape') {
      void window.flit.omniboxHide()
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
            setTimeout(() => void window.flit.omniboxHide(), 150)
          }}
        />
      </form>
      <span className="topbar__spacer" />
      {partition && showActions && (
        <browser-action-list class="topbar__actions" partition={partition} />
      )}
      <button
        type="button"
        className="topbar__btn topbar__puzzle"
        title="Extensions"
        data-testid="extensions-menu"
        disabled={!nav}
        onClick={onExtensionsMenu}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 7 h2 a2 2 0 0 1 2 2 v2 h1.5 a1.5 1.5 0 0 1 0 3 H18 v3 a2 2 0 0 1 -2 2 h-3 v-1.5 a1.5 1.5 0 0 0 -3 0 V19 H7 a2 2 0 0 1 -2 -2 v-3 H3.5 a1.5 1.5 0 0 1 0 -3 H5 V9 a2 2 0 0 1 2 -2 h2 V5.5 a1.5 1.5 0 0 1 3 0 Z" />
        </svg>
      </button>
      {children}
    </div>
  )
}
