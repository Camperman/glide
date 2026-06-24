import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type { BookmarkNode } from '../shared/types'

interface BookmarksBarProps {
  bookmarks: BookmarkNode[]
  onOpen: (url: string) => void
  onOpenFolder: (folderId: string) => void
  onOpenOverflow: (ids: string[]) => void
}

const GAP = 2
const PADDING = 16
const MORE_WIDTH = 44

// Horizontal bookmarks bar. Items that don't fit collapse into a "»" More menu
// (native popup, built in main) instead of a scrollbar. A hidden measurer row
// provides stable item widths so the fitting count doesn't flip-flop.
export function BookmarksBar({
  bookmarks,
  onOpen,
  onOpenFolder,
  onOpenOverflow
}: BookmarksBarProps): JSX.Element {
  const barRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(bookmarks.length)

  useLayoutEffect(() => {
    const bar = barRef.current
    const measure = measureRef.current
    if (!bar || !measure) return

    const compute = (): void => {
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth)
      const total = bar.clientWidth - PADDING
      let sum = 0
      for (let i = 0; i < widths.length; i++) sum += widths[i] + (i ? GAP : 0)
      if (sum <= total) {
        setVisibleCount(bookmarks.length)
        return
      }
      const avail = total - MORE_WIDTH
      let used = 0
      let count = 0
      for (let i = 0; i < widths.length; i++) {
        used += widths[i] + (i ? GAP : 0)
        if (used > avail) break
        count++
      }
      setVisibleCount(count)
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [bookmarks])

  const renderItem = (node: BookmarkNode): ReactElement =>
    node.type === 'folder' ? (
      <button
        key={node.id}
        type="button"
        className="bm bm--folder"
        data-testid={`bm-folder-${node.id}`}
        onClick={() => onOpenFolder(node.id)}
      >
        {node.title || 'Folder'} <span className="bm__caret">▾</span>
      </button>
    ) : (
      <button
        key={node.id}
        type="button"
        className="bm"
        title={node.url}
        data-testid={`bm-${node.id}`}
        onClick={() => onOpen(node.url)}
      >
        {node.title || node.url}
      </button>
    )

  const visible = bookmarks.slice(0, visibleCount)
  const overflow = bookmarks.slice(visibleCount)

  return (
    <div className="bookmarksbar" data-testid="bookmarksbar" ref={barRef}>
      {bookmarks.length === 0 && (
        <span className="bookmarksbar__empty">
          No bookmarks yet — Bookmarks menu → Import from Chrome…
        </span>
      )}
      {visible.map(renderItem)}
      {overflow.length > 0 && (
        <button
          type="button"
          className="bm bm--more"
          title="More bookmarks"
          data-testid="bm-more"
          onClick={() => onOpenOverflow(overflow.map((n) => n.id))}
        >
          »
        </button>
      )}
      {/* Hidden measurer: all items laid out off-screen to read stable widths. */}
      <div className="bookmarksbar__measure" ref={measureRef} aria-hidden>
        {bookmarks.map(renderItem)}
      </div>
    </div>
  )
}
