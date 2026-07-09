import { app } from 'electron'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppRailLayout, BookmarkNode, Prefs, Shortcut } from '../shared/types'

// Settings default to the per-user userData dir. On the author's Mac, two macOS
// users share one config via /Users/Shared/Flit — that mode stays available but
// is now OPT-IN: it's used only when the shared file already exists (his machine)
// or FLIT_SHARED_DIR is set. Fresh installs (friends' Macs) never create a
// world-writable shared dir. Logins/sessions are always per-user regardless.
const SHARED_DIR = process.env.FLIT_SHARED_DIR || '/Users/Shared/Flit'

/** One restorable tab (views are rebuilt lazily on first activation). */
export interface PersistedTab {
  url: string
  originShortcutId?: string
  active?: boolean
}

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
  /** Open tabs at last quit (primary window), restored on launch. */
  tabs?: PersistedTab[]
  /** Remembered site-permission answers (`${origin}|${permission}` → allow). */
  sitePermissions?: Record<string, boolean>
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
  /** User preferences (partial; defaults merged at load). */
  prefs?: Partial<Prefs>
  /** Fresh install: show the welcome flow once. */
  firstRun?: boolean
}

// Fresh installs start with a single starter account; the welcome flow
// (firstRun) lets the user name it, and the sidebar + adds more.
const DEFAULT_ACCOUNTS: PersistedAccount[] = [
  { id: 'personal', label: 'Personal', color: '#4c8bf5', homeUrl: 'https://mail.google.com', order: 0 }
]

export function defaultState(): PersistedState {
  return { version: 1, accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })), firstRun: true }
}

/** One-time migration: the shared config originally lived at
 *  /Users/Shared/Glide/glide-state.json (pre-rebrand). Copy it across so the
 *  author's two-macOS-user setup survives the rename. */
function migrateLegacyShared(): void {
  if (process.env.FLIT_SHARED_DIR) return // tests use throwaway dirs
  try {
    const oldFile = join('/Users/Shared/Glide', 'glide-state.json')
    const newFile = join(SHARED_DIR, 'flit-state.json')
    if (existsSync(oldFile) && !existsSync(newFile)) {
      ensureSharedDir()
      writeFileSync(newFile, readFileSync(oldFile, 'utf8'), 'utf8')
      try {
        chmodSync(newFile, 0o666)
      } catch {
        // ignore
      }
    }
  } catch {
    // best-effort
  }
}

/** Shared mode is opt-in: explicit env, or the shared file already exists. */
let sharedModeCache: boolean | undefined
function sharedMode(): boolean {
  if (sharedModeCache === undefined) {
    migrateLegacyShared()
    sharedModeCache =
      Boolean(process.env.FLIT_SHARED_DIR) || existsSync(join(SHARED_DIR, 'flit-state.json'))
  }
  return sharedModeCache
}

function statePath(): string {
  return sharedMode() ? join(SHARED_DIR, 'flit-state.json') : perUserStatePath()
}

function perUserStatePath(): string {
  return join(app.getPath('userData'), 'flit-state.json')
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

/** Load state from the active location (shared if opted in, else per-user). */
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

/**
 * Best-effort write. In shared mode the file is kept world-writable so a
 * different macOS user can update it later. Failures are non-fatal.
 */
export function saveState(state: PersistedState): void {
  try {
    if (sharedMode()) {
      ensureSharedDir()
      writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
      try {
        chmodSync(statePath(), 0o666)
      } catch {
        // not the owner (another user created it) — content write already succeeded
      }
    } else {
      writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
    }
  } catch {
    // ignore
  }
}
