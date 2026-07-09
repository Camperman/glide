import { useEffect, useState } from 'react'
import type { HistoryItem } from '../shared/types'

interface HistoryDialogProps {
  accountId: string
  accountLabel: string
  onOpenUrl: (url: string) => void
  onClose: () => void
}

function relativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

/** Cmd-Y history browser for the active account. */
export function HistoryDialog({
  accountId,
  accountLabel,
  onOpenUrl,
  onClose
}: HistoryDialogProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<HistoryItem[]>([])

  useEffect(() => {
    void window.flit.listHistory(accountId, query).then(setItems)
  }, [accountId, query])

  const clear = (): void => {
    void window.flit.clearHistory(accountId).then(() => setItems([]))
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal history" data-testid="history">
        <div className="history__head">
          <h2>History — {accountLabel}</h2>
          <input
            type="text"
            placeholder="Search history"
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
        </div>
        <ul className="history__list">
          {items.length === 0 && (
            <li className="history__empty">{query ? 'No matches.' : 'No history yet.'}</li>
          )}
          {items.map((item) => (
            <li key={item.url}>
              <button
                type="button"
                className="history__item"
                title={item.url}
                onClick={() => {
                  onOpenUrl(item.url)
                  onClose()
                }}
              >
                <span className="history__title">{item.title || item.url}</span>
                <span className="history__url">{item.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                <span className="history__time">{relativeTime(item.lastVisit)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="history__foot">
          <button type="button" className="btn" onClick={clear}>
            Clear History
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
