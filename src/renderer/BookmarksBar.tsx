import type { BookmarkNode } from '../shared/types'

interface BookmarksBarProps {
  bookmarks: BookmarkNode[]
  onOpen: (url: string) => void
  onOpenFolder: (folderId: string) => void
}

// Horizontal bookmarks bar. Top-level links open in a tab; folders open a
// native popup menu (handled in main, so nested folders + layering work).
export function BookmarksBar({ bookmarks, onOpen, onOpenFolder }: BookmarksBarProps): JSX.Element {
  return (
    <div className="bookmarksbar" data-testid="bookmarksbar">
      {bookmarks.length === 0 && (
        <span className="bookmarksbar__empty">
          No bookmarks yet — Bookmarks menu → Import from Chrome…
        </span>
      )}
      {bookmarks.map((node) =>
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
      )}
    </div>
  )
}
