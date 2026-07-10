import type { DownloadInfo } from '../shared/types'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function statusLine(d: DownloadInfo): string {
  switch (d.state) {
    case 'progressing':
    case 'paused':
      return d.totalBytes > 0
        ? `${formatBytes(d.receivedBytes)} of ${formatBytes(d.totalBytes)}`
        : formatBytes(d.receivedBytes)
    case 'completed':
      return formatBytes(d.receivedBytes)
    case 'cancelled':
      return 'Cancelled'
    case 'interrupted':
      return 'Failed'
  }
}

interface DownloadsButtonProps {
  downloads: DownloadInfo[]
  onToggle: () => void
}

/** Toolbar downloads button: tray icon, progress ring + pulse while active. */
export function DownloadsButton({ downloads, onToggle }: DownloadsButtonProps): JSX.Element | null {
  if (downloads.length === 0) return null

  const active = downloads.filter((d) => d.state === 'progressing' || d.state === 'paused')
  const total = active.reduce((sum, d) => sum + d.totalBytes, 0)
  const received = active.reduce((sum, d) => sum + d.receivedBytes, 0)
  const progress = active.length > 0 && total > 0 ? received / total : undefined

  // 8px-radius ring around the tray while anything is downloading.
  const R = 8
  const circumference = 2 * Math.PI * R

  return (
    <button
      type="button"
      className={`topbar__btn downloads__btn${active.length > 0 ? ' downloads__btn--active' : ''}`}
      title="Downloads"
      data-testid="downloads-button"
      onClick={onToggle}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 4v9" />
        <path d="m8 10 4 4 4-4" />
        <path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2" />
      </svg>
      {active.length > 0 && (
        <svg className="downloads__ring" viewBox="0 0 20 20">
          <circle className="downloads__ring-track" cx="10" cy="10" r={R} />
          <circle
            className="downloads__ring-fill"
            cx="10"
            cy="10"
            r={R}
            strokeDasharray={circumference}
            strokeDashoffset={
              progress !== undefined ? circumference * (1 - progress) : circumference * 0.7
            }
          />
        </svg>
      )}
    </button>
  )
}

interface DownloadsDrawerProps {
  downloads: DownloadInfo[]
  onClose: () => void
}

/** Right-side downloads drawer. The web view yields its width while open
 *  (main shrinks it), so the page stays visible — no overlay blanking. */
export function DownloadsDrawer({ downloads, onClose }: DownloadsDrawerProps): JSX.Element {
  return (
    <aside className="downloads__drawer" data-testid="downloads-panel">
      <div className="downloads__head">
        <span>Downloads</span>
        <div>
          <button type="button" onClick={() => void window.flit.clearDownloads()}>
            Clear
          </button>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <ul className="downloads__list">
        {downloads.length === 0 && <li className="downloads__empty">No downloads yet</li>}
        {downloads.map((d) => (
          <li key={d.id} className="downloads__item">
            <button
              type="button"
              className="downloads__file"
              disabled={d.state !== 'completed'}
              title={d.state === 'completed' ? 'Open' : undefined}
              onClick={() => void window.flit.openDownload(d.id)}
            >
              <span className="downloads__name">{d.filename}</span>
              <span className="downloads__status">{statusLine(d)}</span>
              {(d.state === 'progressing' || d.state === 'paused') && (
                <span className="downloads__bar">
                  <span
                    className="downloads__bar-fill"
                    style={{
                      width:
                        d.totalBytes > 0
                          ? `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`
                          : '100%'
                    }}
                  />
                </span>
              )}
            </button>
            {d.state === 'completed' && (
              <button
                type="button"
                className="downloads__action"
                title="Show in Finder"
                onClick={() => void window.flit.showDownload(d.id)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
              </button>
            )}
            {(d.state === 'progressing' || d.state === 'paused') && (
              <button
                type="button"
                className="downloads__action"
                title="Cancel"
                onClick={() => void window.flit.cancelDownload(d.id)}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
