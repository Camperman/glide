import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Shortcut } from '../shared/types'

export interface PersistedAccount {
  id: string
  label: string
  color: string
  homeUrl: string
  lastUrl?: string
  order: number
  shortcuts?: Shortcut[]
  avatarUrl?: string
  activeShortcutId?: string
}

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

export interface PersistedState {
  version: 1
  accounts: PersistedAccount[]
  activeAccountId?: string
  window?: WindowBounds
}

const DEFAULT_ACCOUNTS: PersistedAccount[] = [
  { id: 'one', label: 'One', color: '#4c8bf5', homeUrl: 'https://mail.google.com', order: 0 },
  { id: 'two', label: 'Two', color: '#34a853', homeUrl: 'https://mail.google.com', order: 1 },
  { id: 'three', label: 'Three', color: '#ea4335', homeUrl: 'https://mail.google.com', order: 2 }
]

export function defaultState(): PersistedState {
  return { version: 1, accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })) }
}

function statePath(): string {
  return join(app.getPath('userData'), 'glide-state.json')
}

/** Load persisted state, falling back to defaults on missing/corrupt/invalid file. */
export function loadState(): PersistedState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8')) as PersistedState
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.accounts) ||
      parsed.accounts.length === 0
    ) {
      return defaultState()
    }
    return parsed
  } catch {
    return defaultState()
  }
}

/** Best-effort write; persistence failures are non-fatal for a personal tool. */
export function saveState(state: PersistedState): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // ignore
  }
}
