import { useEffect, useState } from 'react'
import type { ChromeProfile } from '../shared/types'

interface ChromeImportDialogProps {
  onImport: (chromeDir: string) => void
  onCancel: () => void
}

// Modal listing detected Chrome profiles; picking one imports its Bookmarks
// bar into the active Flit profile.
export function ChromeImportDialog({ onImport, onCancel }: ChromeImportDialogProps): JSX.Element {
  const [profiles, setProfiles] = useState<ChromeProfile[] | null>(null)

  useEffect(() => {
    void window.flit.getChromeProfiles().then(setProfiles)
  }, [])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import bookmarks from Chrome</h2>
        <p className="modal__hint">Choose a Chrome profile to import its bookmarks bar from.</p>

        <div className="chrome-profiles">
          {profiles === null && <p className="modal__hint">Looking for Chrome profiles…</p>}
          {profiles?.length === 0 && <p className="modal__hint">No Chrome profiles found.</p>}
          {profiles?.map((profile) => (
            <button
              key={profile.dir}
              type="button"
              className="chrome-profile"
              data-testid={`chrome-${profile.dir}`}
              onClick={() => onImport(profile.dir)}
            >
              <span className="chrome-profile__name">{profile.name}</span>
              <span className="chrome-profile__count">{profile.count} bookmarks</span>
            </button>
          ))}
        </div>

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
