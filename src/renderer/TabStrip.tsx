import type { TabInfo } from '../shared/types'

interface TabStripProps {
  tabs: TabInfo[]
  disabled: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onNew: () => void
}

// Browser tab strip living in the title bar. Each tab shows its page title and
// an × to close; + opens a new tab. Empty strip area stays draggable (the tab
// elements opt out via CSS) so the title bar is still a window grab handle.
export function TabStrip({ tabs, disabled, onActivate, onClose, onNew }: TabStripProps): JSX.Element {
  return (
    <div className="tabstrip" data-testid="tabstrip">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab${tab.active ? ' tab--active' : ''}`}
          data-testid={`tab-${tab.id}`}
          title={tab.title}
          onClick={() => onActivate(tab.id)}
        >
          {tab.favicon && <img className="tab__favicon" src={tab.favicon} alt="" />}
          <span className="tab__title">{tab.title}</span>
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
