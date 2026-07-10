import type { UpdateState } from '../shared/types'

interface UpdatePillProps {
  state: UpdateState
  onRestart: () => void
}

// Toolbar auto-update indicator: shows checking / download progress, and a
// "Restart to update" button once an update is downloaded. Renders nothing
// when idle. Complements the native restart prompt — this is the persistent,
// in-app affordance so a background download visibly progresses instead of
// "nothing happening".
export function UpdatePill({ state, onRestart }: UpdatePillProps): JSX.Element | null {
  if (state.status === 'idle' || state.status === 'error') return null

  if (state.status === 'ready') {
    return (
      <button
        type="button"
        className="update-pill update-pill--ready"
        data-testid="update-pill"
        title={`Flit ${state.version ?? ''} downloaded — restart to install`}
        onClick={onRestart}
      >
        ↻ Restart to update
      </button>
    )
  }

  const pct = state.status === 'downloading' ? Math.round(state.percent ?? 0) : undefined
  return (
    <span
      className="update-pill"
      data-testid="update-pill"
      title="Downloading update in the background"
    >
      <span className="update-pill__spinner" aria-hidden="true" />
      {state.status === 'checking'
        ? 'Checking for updates…'
        : `Updating${pct !== undefined ? ` ${pct}%` : '…'}`}
    </span>
  )
}
