import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccountSummary, TabInfo } from '../shared/types'

interface PaletteEntry {
  key: string
  kind: 'account' | 'app' | 'tab'
  label: string
  detail: string
  run: () => void
}

interface PaletteProps {
  accounts: AccountSummary[]
  activeId?: string
  tabs: TabInfo[]
  onClose: () => void
}

/** Score a fuzzy match: prefix > word-boundary > substring > none. */
function score(label: string, needle: string): number {
  const l = label.toLowerCase()
  if (l.startsWith(needle)) return 3
  if (l.includes(` ${needle}`) || l.includes(`› ${needle}`)) return 2
  if (l.includes(needle)) return 1
  return 0
}

/** Cmd-K quick switcher: fuzzy-jump to any account, app, or open tab. */
export function Palette({ accounts, activeId, tabs, onClose }: PaletteProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [entries, setEntries] = useState<PaletteEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Assemble the jump targets: accounts, every account's apps, active tabs.
  useEffect(() => {
    let cancelled = false
    const build = async (): Promise<void> => {
      const out: PaletteEntry[] = []
      for (const account of accounts) {
        out.push({
          key: `acct-${account.id}`,
          kind: 'account',
          label: account.label,
          detail: 'Account',
          run: () => void window.flit.switchAccount(account.id)
        })
      }
      for (const account of accounts) {
        const shortcuts = await window.flit.getShortcuts(account.id)
        for (const s of shortcuts) {
          out.push({
            key: `app-${account.id}-${s.id}`,
            kind: 'app',
            label: `${account.label} › ${s.label}`,
            detail: 'App',
            run: () => {
              void window.flit.switchAccount(account.id).then(() => {
                void window.flit.openShortcut(account.id, s.id)
              })
            }
          })
        }
      }
      for (const tab of tabs) {
        if (!activeId) break
        out.push({
          key: `tab-${tab.id}`,
          kind: 'tab',
          label: tab.title,
          detail: 'Tab',
          run: () => void window.flit.activateTab(activeId, tab.id)
        })
      }
      if (!cancelled) setEntries(out)
    }
    void build()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries.slice(0, 9)
    return entries
      .map((e) => ({ e, s: score(e.label, needle) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map((x) => x.e)
  }, [entries, query])

  useEffect(() => setSelected(0), [query])

  const run = (entry: PaletteEntry | undefined): void => {
    if (!entry) return
    entry.run()
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" data-testid="palette">
        <input
          ref={inputRef}
          type="text"
          placeholder="Jump to account, app, or tab…"
          value={query}
          autoFocus
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(s + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              run(shown[selected])
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
        />
        <ul>
          {shown.length === 0 && <li className="palette__empty">No matches</li>}
          {shown.map((entry, i) => (
            <li key={entry.key}>
              <button
                type="button"
                className={`palette__item${i === selected ? ' is-selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => run(entry)}
              >
                <span className="palette__label">{entry.label}</span>
                <span className="palette__detail">{entry.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
