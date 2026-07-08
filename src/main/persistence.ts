import { app } from 'electron'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppRailLayout, BookmarkNode, Shortcut } from '../shared/types'

// Settings live in a machine-shared location so any macOS user account on this
// computer loads the same profiles/apps/bookmarks/layout. (Logins/sessions stay
// private per macOS user in each user's own userData — not shared.)
// Overridable via env so automated tests run against a throwaway dir.
const SHARED_DIR = process.env.GLIDE_SHARED_DIR || '/Users/Shared/Glide'

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
  bookmarks?: BookmarkNode[]
  /** Notifications from this account are suppressed. */
  muted?: boolean
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
  zoomFactor?: number
  layout?: AppRailLayout
  bookmarksBar?: boolean
  /** One-time flag: the Passwords app has been seeded into existing profiles. */
  seededPasswordsApp?: boolean
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
  return join(SHARED_DIR, 'glide-state.json')
}

/** The pre-sharing per-user location, used once to migrate into the shared dir. */
function legacyStatePath(): string {
  return join(app.getPath('userData'), 'glide-state.json')
}

/** Create the shared dir world-writable so every macOS user can read/write it. */
function ensureSharedDir(): void {
  try {
    if (!existsSync(SHARED_DIR)) {
      mkdirSync(SHARED_DIR, { recursive: true })
      chmodSync(SHARED_DIR, 0o777)
    }
  } catch {
    // best-effort
  }
}

/** Load shared state, migrating a legacy per-user file in once, else defaults. */
export function loadState(): PersistedState {
  ensureSharedDir()
  try {
    if (!existsSync(statePath()) && existsSync(legacyStatePath())) {
      writeFileSync(statePath(), readFileSync(legacyStatePath(), 'utf8'), 'utf8')
      try {
        chmodSync(statePath(), 0o666)
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore — fall through to normal load
  }
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

/**
 * Best-effort write to the shared config. The file is made world-writable so a
 * different macOS user can update it later. Failures are non-fatal.
 */
export function saveState(state: PersistedState): void {
  try {
    ensureSharedDir()
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
    try {
      chmodSync(statePath(), 0o666)
    } catch {
      // not the owner (another user created it) — content write already succeeded
    }
  } catch {
    // ignore
  }
}
