// Omnibox suggestions page (runs inside the floating WebContentsView).

interface Suggestion {
  kind: 'history' | 'bookmark' | 'search' | 'url'
  title: string
  url: string
  fill: string
}

interface RenderPayload {
  suggestions: Suggestion[]
  selected: number
  dark: boolean
  accent: string
}

declare global {
  interface Window {
    sug: {
      onRender(cb: (payload: RenderPayload) => void): void
      onSelect(cb: (index: number) => void): void
      click(index: number): void
    }
  }
}

const ICONS: Record<Suggestion['kind'], string> = {
  history: '↺',
  bookmark: '★',
  search: '⌕',
  url: '→'
}

const panel = document.getElementById('panel')!

function applyTheme(dark: boolean): void {
  const root = document.documentElement
  root.style.setProperty('--bg', dark ? '#23262d' : '#ffffff')
  root.style.setProperty('--border', dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)')
  root.style.setProperty('--text', dark ? '#e6e8ec' : '#1f2328')
  root.style.setProperty('--muted', dark ? '#9aa0aa' : '#697180')
  root.style.setProperty('--hover', dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)')
}

window.sug.onRender((payload) => {
  applyTheme(payload.dark)
  panel.replaceChildren(
    ...payload.suggestions.map((s, i) => {
      const row = document.createElement('div')
      row.className = 'row' + (i === payload.selected ? ' sel' : '')
      row.dataset.index = String(i)

      const icon = document.createElement('span')
      icon.className = 'icon'
      icon.textContent = ICONS[s.kind]

      const title = document.createElement('span')
      title.className = 'title'
      title.textContent = s.title

      row.append(icon, title)
      if (s.url) {
        const url = document.createElement('span')
        url.className = 'url'
        url.textContent = ` — ${s.url.replace(/^https?:\/\/(www\.)?/, '')}`
        row.append(url)
      }
      // mousedown (not click): fires before the omnibox input's blur handler.
      row.addEventListener('mousedown', () => window.sug.click(i))
      return row
    })
  )
})

window.sug.onSelect((index) => {
  panel.querySelectorAll('.row').forEach((row, i) => {
    row.classList.toggle('sel', i === index)
  })
})

export {}
