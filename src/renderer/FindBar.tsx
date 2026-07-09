import { useEffect, useRef, useState } from 'react'

interface FindBarProps {
  onClose: () => void
}

/** Cmd-F find bar. Occupies a chrome row (main shrinks the web view for it),
 *  so the page stays visible while searching — no overlay. */
export function FindBar({ onClose }: FindBarProps): JSX.Element {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ matches: number; activeMatchOrdinal: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const offResult = window.flit.onFindResult(setResult)
    // Cmd-F while already open → refocus + select.
    const offReopen = window.flit.onFindOpen(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => {
      offResult()
      offReopen()
    }
  }, [])

  const search = (value: string): void => {
    setText(value)
    if (!value) setResult(null)
    void window.flit.findInPage(value, false, true)
  }

  const step = (forward: boolean): void => {
    if (text) void window.flit.findInPage(text, true, forward)
  }

  return (
    <div className="findbar" data-testid="findbar">
      <input
        ref={inputRef}
        type="text"
        value={text}
        placeholder="Find in page"
        spellCheck={false}
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') step(!e.shiftKey)
          if (e.key === 'Escape') onClose()
        }}
      />
      <span className="findbar__count">
        {text && result ? `${result.activeMatchOrdinal} / ${result.matches}` : ''}
      </span>
      <button type="button" title="Previous (⇧↩)" onClick={() => step(false)}>
        ‹
      </button>
      <button type="button" title="Next (↩)" onClick={() => step(true)}>
        ›
      </button>
      <button type="button" title="Close (esc)" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
