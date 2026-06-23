// Phase 0: static shell. Phase 2+ populates this with real account items,
// active-state highlighting, the [+] add button, badges, and avatars.
export function Sidebar(): JSX.Element {
  return (
    <nav className="sidebar" data-testid="sidebar" aria-label="Accounts">
      <div className="sidebar__brand" title="Glide">G</div>
      <div className="sidebar__accounts">
        {/* account items injected in later phases */}
      </div>
      <button className="sidebar__add" type="button" title="Add account (Phase 4)" disabled>
        +
      </button>
    </nav>
  )
}
