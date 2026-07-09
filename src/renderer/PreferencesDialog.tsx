import { useEffect, useState } from 'react'
import { THEMES } from '../shared/themes'
import type {
  AccountSummary,
  Appearance,
  ExtensionInfo,
  Prefs,
  SearchEngine
} from '../shared/types'

interface PreferencesDialogProps {
  prefs: Prefs
  /** Resolved appearance (drives which swatch variant is previewed). */
  dark: boolean
  accounts: AccountSummary[]
  activeAccountId?: string
  onClose: () => void
}

type Section = 'general' | 'extensions' | 'downloads'

const APPEARANCES: Array<{ id: Appearance; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
]

const SEARCH_ENGINES: Array<{ id: SearchEngine; label: string }> = [
  { id: 'google', label: 'Google' },
  { id: 'duckduckgo', label: 'DuckDuckGo' },
  { id: 'bing', label: 'Bing' }
]

const WEB_STORE_URL = 'https://chromewebstore.google.com/'

export function PreferencesDialog({
  prefs,
  dark,
  accounts,
  activeAccountId,
  onClose
}: PreferencesDialogProps): JSX.Element {
  const [section, setSection] = useState<Section>('general')
  const [isDefault, setIsDefault] = useState(false)
  const [extAccount, setExtAccount] = useState(activeAccountId ?? accounts[0]?.id)
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([])
  const [newTabDraft, setNewTabDraft] = useState(prefs.newTabUrl)

  const patch = (p: Partial<Prefs>): void => void window.flit.setPrefs(p)

  useEffect(() => {
    void window.flit.isDefaultBrowser().then(setIsDefault)
  }, [])

  useEffect(() => {
    if (extAccount) void window.flit.listExtensions(extAccount).then(setExtensions)
    else setExtensions([])
  }, [extAccount])

  const uninstall = (id: string): void => {
    if (!extAccount) return
    void window.flit
      .uninstallExtension(extAccount, id)
      .then(() => window.flit.listExtensions(extAccount))
      .then(setExtensions)
  }

  const isDark = dark

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal prefs" data-testid="preferences">
        <div className="prefs__side">
          <h2>Preferences</h2>
          {(
            [
              ['general', 'General'],
              ['extensions', 'Extensions'],
              ['downloads', 'Downloads']
            ] as Array<[Section, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`prefs__nav${section === id ? ' prefs__nav--active' : ''}`}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="prefs__body">
          {section === 'general' && (
            <>
              <div className="prefs__row">
                <label>Appearance</label>
                <div className="prefs__segmented">
                  {APPEARANCES.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={prefs.appearance === a.id ? 'is-active' : ''}
                      onClick={() => patch({ appearance: a.id })}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="prefs__row prefs__row--stack">
                <label>Color profile</label>
                <div className="prefs__swatches">
                  {THEMES.map((t) => {
                    const c = isDark ? t.dark : t.light
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`prefs__swatch${prefs.themeId === t.id ? ' is-active' : ''}`}
                        title={t.label}
                        onClick={() => patch({ themeId: t.id })}
                      >
                        <span className="prefs__swatch-chip" style={{ background: c.bg }}>
                          <span style={{ background: c.accent }} />
                        </span>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="prefs__row">
                <label htmlFor="pref-acct-accent">Accent follows active account</label>
                <input
                  id="pref-acct-accent"
                  type="checkbox"
                  checked={prefs.accountAccent}
                  onChange={(e) => patch({ accountAccent: e.target.checked })}
                />
              </div>

              <div className="prefs__row">
                <label htmlFor="pref-login">Launch Flit at login</label>
                <input
                  id="pref-login"
                  type="checkbox"
                  checked={prefs.launchAtLogin}
                  onChange={(e) => patch({ launchAtLogin: e.target.checked })}
                />
              </div>

              <div className="prefs__row">
                <label>Default browser</label>
                {isDefault ? (
                  <span className="prefs__hint">Flit is your default browser</span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void window.flit
                        .makeDefaultBrowser()
                        .then(() => window.flit.isDefaultBrowser())
                        .then(setIsDefault)
                    }
                  >
                    Make default…
                  </button>
                )}
              </div>

              <div className="prefs__row">
                <label>Site permissions</label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void window.flit.resetSitePermissions()}
                >
                  Reset remembered answers
                </button>
              </div>

              <div className="prefs__row">
                <label htmlFor="pref-newtab">New tab opens</label>
                <input
                  id="pref-newtab"
                  type="text"
                  className="prefs__input"
                  value={newTabDraft}
                  spellCheck={false}
                  onChange={(e) => setNewTabDraft(e.target.value)}
                  onBlur={() => newTabDraft.trim() && patch({ newTabUrl: newTabDraft.trim() })}
                />
              </div>

              <div className="prefs__row">
                <label htmlFor="pref-search">Search engine</label>
                <select
                  id="pref-search"
                  value={prefs.searchEngine}
                  onChange={(e) => patch({ searchEngine: e.target.value as SearchEngine })}
                >
                  {SEARCH_ENGINES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {section === 'extensions' && (
            <>
              <div className="prefs__row">
                <label htmlFor="pref-ext-account">Account</label>
                <select
                  id="pref-ext-account"
                  value={extAccount}
                  onChange={(e) => setExtAccount(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              {extensions.length === 0 ? (
                <p className="prefs__hint">
                  No extensions installed for this account. Extensions install per account —
                  open the Chrome Web Store in a tab and click “Add to Chrome”.
                </p>
              ) : (
                <ul className="prefs__extensions">
                  {extensions.map((ext) => (
                    <li key={ext.id}>
                      <span className="prefs__ext-name">{ext.name}</span>
                      <span className="prefs__ext-version">{ext.version}</span>
                      <button type="button" className="btn" onClick={() => uninstall(ext.id)}>
                        Uninstall
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="btn"
                disabled={!extAccount}
                onClick={() => {
                  if (extAccount) void window.flit.openBookmark(extAccount, WEB_STORE_URL)
                  onClose()
                }}
              >
                Open Chrome Web Store…
              </button>
            </>
          )}

          {section === 'downloads' && (
            <>
              <div className="prefs__row">
                <label>Save downloads to</label>
                <button
                  type="button"
                  className="btn prefs__path"
                  title={prefs.downloadsDir || '~/Downloads'}
                  onClick={() =>
                    void window.flit.chooseDownloadsDir().then((dir) => {
                      if (dir) patch({ downloadsDir: dir })
                    })
                  }
                >
                  {prefs.downloadsDir ? prefs.downloadsDir.replace(/^.*\//, '') : 'Downloads'}
                  <span className="prefs__hint"> — change…</span>
                </button>
              </div>
              <div className="prefs__row">
                <label htmlFor="pref-ask">Ask where to save each file</label>
                <input
                  id="pref-ask"
                  type="checkbox"
                  checked={prefs.askWhereToSave}
                  onChange={(e) => patch({ askWhereToSave: e.target.checked })}
                />
              </div>
            </>
          )}
        </div>

        <button type="button" className="prefs__close" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  )
}
