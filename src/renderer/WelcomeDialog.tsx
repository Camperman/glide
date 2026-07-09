import { useState } from 'react'

interface WelcomeDialogProps {
  initialLabel: string
  onDone: (label: string, color: string) => void
}

const COLORS = ['#4c8bf5', '#34a853', '#ea4335', '#fbbc04', '#b57ce0', '#35c2b4']

/** One-time welcome on fresh installs: name the starter account, pick its
 *  color, learn where + lives. */
export function WelcomeDialog({ initialLabel, onDone }: WelcomeDialogProps): JSX.Element {
  const [label, setLabel] = useState(initialLabel)
  const [color, setColor] = useState(COLORS[0])

  const finish = (): void => onDone(label.trim() || initialLabel, color)

  return (
    <div className="modal-overlay">
      <div className="modal welcome" data-testid="welcome">
        <h1>Welcome to Flit</h1>
        <p className="welcome__lede">
          Every account in the left sidebar is a fully isolated Google session — sign in
          once and it stays signed in, without logging out your other accounts.
        </p>
        <div className="field">
          <span>Name your first account</span>
          <input
            type="text"
            value={label}
            autoFocus
            spellCheck={false}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && finish()}
          />
        </div>
        <div className="field">
          <span>Pick a color</span>
          <div className="welcome__colors">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`welcome__color${color === c ? ' is-active' : ''}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <p className="welcome__hint">
          Add more accounts anytime with the <strong>+</strong> at the bottom of the
          sidebar. Preferences live under <strong>⌘,</strong>
        </p>
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={finish}>
            Get Started
          </button>
        </div>
      </div>
    </div>
  )
}
