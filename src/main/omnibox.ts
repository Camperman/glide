import { BrowserWindow, WebContentsView, ipcMain, net } from 'electron'
import { join } from 'path'
import type { AccountManager } from './accounts'
import type { HistoryManager } from './history'
import type { PrefsManager } from './prefs'
import type { BookmarkNode } from '../shared/types'
import { themeById } from '../shared/themes'

export interface Suggestion {
  kind: 'history' | 'bookmark' | 'search' | 'url'
  title: string
  url: string
  /** What gets written into the address field when selected. */
  fill: string
}

interface OmniboxWindow {
  view: WebContentsView
  ready: Promise<void>
  suggestions: Suggestion[]
  selected: number
  visible: boolean
  /** Monotonic per-keystroke token; stale async computes are discarded. */
  token: number
}

const ROW_HEIGHT = 34
const PANEL_PAD = 6
const MAX_ROWS = 6

const SEARCH_LABEL: Record<string, string> = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing'
}

// All three speak the OpenSearch suggestion format: [query, [phrases…]].
const SUGGEST_URLS: Record<string, (q: string) => string> = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${q}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?type=list&q=${q}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?query=${q}`
}

function looksLikeUrl(text: string): boolean {
  return (
    !/\s/.test(text) &&
    (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^[^\s/.]+\.[^\s/.]+/.test(text))
  )
}

/** Live query completions from the selected engine; empty on any failure. */
async function fetchCompletions(engine: string, text: string): Promise<string[]> {
  const build = SUGGEST_URLS[engine]
  if (!build) return []
  try {
    const res = await net.fetch(build(encodeURIComponent(text)), {
      signal: AbortSignal.timeout(800)
    })
    if (!res.ok) return []
    const data = (await res.json()) as unknown
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return (data[1] as unknown[]).filter((s): s is string => typeof s === 'string')
    }
  } catch {
    // offline / timeout / shape change — suggestions are best-effort
  }
  return []
}

function flattenBookmarks(nodes: BookmarkNode[], out: Array<{ title: string; url: string }>): void {
  for (const node of nodes) {
    if (node.type === 'link') out.push({ title: node.title, url: node.url })
    else flattenBookmarks(node.children, out)
  }
}

/**
 * Address-bar autocomplete. DOM can't paint above account WebContentsViews, so
 * the dropdown is its own small trusted view floated over the content, fed and
 * positioned by main. The renderer keeps focus; selection state lives here.
 */
export class OmniboxManager {
  private readonly windows = new Map<number, OmniboxWindow>()

  constructor(
    private readonly accounts: AccountManager,
    private readonly history: HistoryManager,
    private readonly prefs: PrefsManager
  ) {
    // Clicks inside the suggestions view → navigate.
    ipcMain.on('sug:click', (event, index: number) => {
      for (const [winId, ow] of this.windows) {
        if (ow.view.webContents.id !== event.sender.id) continue
        const win = BrowserWindow.fromId(winId)
        const suggestion = ow.suggestions[index]
        if (win && suggestion) {
          this.hide(win)
          this.accounts.navigate(win, suggestion.fill)
        }
        return
      }
    })
  }

  private forWindow(win: BrowserWindow): OmniboxWindow {
    let ow = this.windows.get(win.id)
    if (ow) return ow
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/suggestions.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    view.setBorderRadius(10)
    const url = process.env['ELECTRON_RENDERER_URL']
    const ready = url
      ? view.webContents.loadURL(`${url}/suggestions.html`)
      : view.webContents.loadFile(join(__dirname, '../renderer/suggestions.html'))
    ow = {
      view,
      ready: ready.catch(() => {}),
      suggestions: [],
      selected: -1,
      visible: false,
      token: 0
    }
    this.windows.set(win.id, ow)
    win.on('closed', () => this.windows.delete(win.id))
    win.on('resize', () => this.hide(win))
    return ow
  }

  /** New omnibox text: recompute suggestions and (re)position the dropdown. */
  async update(
    win: BrowserWindow,
    text: string,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) {
      this.hide(win)
      return
    }
    const ow = this.forWindow(win)
    const token = ++ow.token
    const suggestions = await this.compute(win, trimmed)
    if (token !== ow.token) return // superseded by a newer keystroke
    ow.suggestions = suggestions
    ow.selected = -1
    if (suggestions.length === 0) {
      this.hide(win)
      return
    }
    await ow.ready
    const state = this.prefs.state()
    const theme = themeById(state.prefs.themeId)[state.dark ? 'dark' : 'light']
    ow.view.webContents.send('sug:render', {
      suggestions,
      selected: ow.selected,
      dark: state.dark,
      accent: theme.accent
    })
    const height = Math.min(suggestions.length, MAX_ROWS) * ROW_HEIGHT + PANEL_PAD * 2
    ow.view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y + rect.height + 6),
      width: Math.round(rect.width),
      height
    })
    if (!ow.visible) {
      ow.visible = true
      ow.view.setVisible(true)
    }
    // (Re-)append so the dropdown z-orders above every account view.
    win.contentView.addChildView(ow.view)
  }

  /** Arrow-key selection; returns the text to fill into the address field. */
  navigate(win: BrowserWindow, delta: 1 | -1): string | undefined {
    const ow = this.windows.get(win.id)
    if (!ow || !ow.visible || ow.suggestions.length === 0) return undefined
    const count = ow.suggestions.length
    ow.selected = (ow.selected + delta + count + 1) % (count + 1) // extra slot = "no selection"
    const index = ow.selected === count ? -1 : ow.selected
    ow.view.webContents.send('sug:select', index)
    return index === -1 ? undefined : ow.suggestions[index].fill
  }

  hide(win: BrowserWindow): void {
    const ow = this.windows.get(win.id)
    if (!ow || !ow.visible) return
    ow.visible = false
    ow.selected = -1
    ow.view.setVisible(false)
  }

  private async compute(win: BrowserWindow, text: string): Promise<Suggestion[]> {
    const accountId = this.accounts.getActiveId(win)
    if (!accountId) return []
    const out: Suggestion[] = []
    const seen = new Set<string>()
    const engine = this.prefs.state().prefs.searchEngine

    // Live engine completions fetch while we assemble the local rows.
    const completionsPromise = looksLikeUrl(text)
      ? Promise.resolve<string[]>([])
      : fetchCompletions(engine, text)

    for (const entry of this.history.query(accountId, text, 3)) {
      out.push({
        kind: 'history',
        title: entry.title || entry.url,
        url: entry.url,
        fill: entry.url
      })
      seen.add(entry.url)
    }

    const links: Array<{ title: string; url: string }> = []
    flattenBookmarks(this.accounts.getBookmarks(accountId), links)
    const needle = text.toLowerCase()
    for (const link of links) {
      if (out.length >= 4) break
      if (seen.has(link.url)) continue
      if (link.title.toLowerCase().includes(needle) || link.url.toLowerCase().includes(needle)) {
        out.push({ kind: 'bookmark', title: link.title, url: link.url, fill: link.url })
        seen.add(link.url)
      }
    }

    for (const phrase of await completionsPromise) {
      if (out.length >= MAX_ROWS - 1) break
      if (phrase.toLowerCase() === text.toLowerCase()) continue // escape row covers it
      out.push({ kind: 'search', title: phrase, url: '', fill: phrase })
    }

    // Always offer the search escape hatch last.
    out.push({
      kind: 'search',
      title: `Search ${SEARCH_LABEL[engine] ?? 'the web'} for “${text}”`,
      url: '',
      fill: text
    })
    return out.slice(0, MAX_ROWS)
  }
}
