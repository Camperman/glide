import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface HistoryEntry {
  url: string
  title: string
  visits: number
  lastVisit: number
}

interface HistoryFile {
  version: 1
  /** accountId → entries (unordered; ranked at query time). */
  entries: Record<string, HistoryEntry[]>
}

const MAX_PER_ACCOUNT = 3000
const SAVE_DEBOUNCE_MS = 2000

/**
 * Per-account browsing history feeding omnibox suggestions. Lives in the
 * per-user userData dir (never the shared config — history is personal).
 */
export class HistoryManager {
  private data: HistoryFile = { version: 1, entries: {} }
  private saveTimer: NodeJS.Timeout | undefined

  private path(): string {
    return join(app.getPath('userData'), 'glide-history.json')
  }

  load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.path(), 'utf8')) as HistoryFile
      if (parsed?.version === 1 && parsed.entries) this.data = parsed
    } catch {
      // first run / unreadable — start empty
    }
  }

  /** Record a main-frame navigation (http/https only). */
  record(accountId: string, url: string, title: string): void {
    if (!/^https?:\/\//i.test(url)) return
    const list = (this.data.entries[accountId] ??= [])
    const existing = list.find((e) => e.url === url)
    if (existing) {
      existing.visits += 1
      existing.lastVisit = Date.now()
      if (title) existing.title = title
    } else {
      list.push({ url, title, visits: 1, lastVisit: Date.now() })
      if (list.length > MAX_PER_ACCOUNT) {
        list.sort((a, b) => b.lastVisit - a.lastVisit)
        list.length = MAX_PER_ACCOUNT
      }
    }
    this.scheduleSave()
  }

  /** Late title update for a URL already recorded. */
  title(accountId: string, url: string, title: string): void {
    const entry = this.data.entries[accountId]?.find((e) => e.url === url)
    if (entry && title) {
      entry.title = title
      this.scheduleSave()
    }
  }

  removeAccount(accountId: string): void {
    delete this.data.entries[accountId]
    this.scheduleSave()
  }

  /** Top matches for the omnibox: substring match on URL/title, ranked by
   *  frecency (visits weighted by recency), host-prefix matches boosted. */
  query(accountId: string, text: string, limit: number): HistoryEntry[] {
    const needle = text.trim().toLowerCase()
    if (!needle) return []
    const now = Date.now()
    const scored: Array<{ entry: HistoryEntry; score: number }> = []
    for (const entry of this.data.entries[accountId] ?? []) {
      const url = entry.url.toLowerCase()
      const title = entry.title.toLowerCase()
      const host = url.replace(/^https?:\/\/(www\.)?/, '')
      let match = 0
      if (host.startsWith(needle)) match = 3
      else if (title.includes(needle)) match = 2
      else if (url.includes(needle)) match = 1
      if (!match) continue
      const ageDays = (now - entry.lastVisit) / 86_400_000
      const recency = ageDays < 1 ? 3 : ageDays < 7 ? 2 : ageDays < 30 ? 1 : 0.5
      scored.push({ entry, score: match * 10 + Math.min(entry.visits, 20) * recency })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => s.entry)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), SAVE_DEBOUNCE_MS)
    this.saveTimer.unref?.()
  }

  save(): void {
    try {
      writeFileSync(this.path(), JSON.stringify(this.data), 'utf8')
    } catch {
      // best-effort
    }
  }
}
