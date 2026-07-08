import { useRef, useState, type DragEvent } from 'react'
import type { TabInfo } from '../shared/types'

interface TabStripProps {
  tabs: TabInfo[]
  disabled: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onReorder: (tabIds: string[]) => void
  onToggleMute: (tabId: string) => void
  onNew: () => void
}

// Browser tab strip living in the title bar. Tabs show favicon + title + ×,
// + opens a new tab, and tabs can be dragged to reorder. Empty strip area
// stays draggable (the tab elements opt out via CSS) so the title bar still
// grabs the window.
export function TabStrip({
  tabs,
  disabled,
  onActivate,
  onClose,
  onReorder,
  onToggleMute,
  onNew
}: TabStripProps): JSX.Element {
  const dragId = useRef<string | null>(null)
  const [order, setOrder] = useState<TabInfo[] | null>(null)

  // Show the live drag preview while dragging, otherwise the real tab list.
  const shown = order ?? tabs

  const handleDragStart = (id: string): void => {
    dragId.current = id
    setOrder(tabs)
  }

  const handleDragOver = (e: DragEvent, overId: string): void => {
    e.preventDefault()
    const current = order ?? tabs
    const from = current.findIndex((t) => t.id === dragId.current)
    const to = current.findIndex((t) => t.id === overId)
    if (from === -1 || to === -1 || from === to) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
  }

  const handleDragEnd = (): void => {
    if (order) onReorder(order.map((t) => t.id))
    dragId.current = null
    setOrder(null)
  }

  return (
    <div className="tabstrip" data-testid="tabstrip">
      {shown.map((tab) => (
        <div
          key={tab.id}
          className={`tab${tab.active ? ' tab--active' : ''}`}
          data-testid={`tab-${tab.id}`}
          title={tab.title}
          draggable
          onClick={() => onActivate(tab.id)}
          onDragStart={() => handleDragStart(tab.id)}
          onDragOver={(e) => handleDragOver(e, tab.id)}
          onDragEnd={handleDragEnd}
          onDrop={handleDragEnd}
        >
          {tab.favicon && <img className="tab__favicon" src={tab.favicon} alt="" />}
          <span className="tab__title">{tab.title}</span>
          {(tab.audible || tab.muted) && (
            <button
              type="button"
              className="tab__audio"
              title={tab.muted ? 'Unmute tab' : 'Mute tab'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleMute(tab.id)
              }}
            >
              {tab.muted ? '🔇' : '🔊'}
            </button>
          )}
          <button
            type="button"
            className="tab__close"
            aria-label="Close tab"
            data-testid={`tab-close-${tab.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="tab-new"
        title="New tab"
        data-testid="tab-new"
        disabled={disabled}
        onClick={onNew}
      >
        +
      </button>
    </div>
  )
}
