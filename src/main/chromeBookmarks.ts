import { existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { BookmarkNode, ChromeProfile } from '../shared/types'

const CHROME_DIR = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')

interface RawNode {
  type?: string
  name?: string
  url?: string
  children?: RawNode[]
}

function countLinks(nodes: RawNode[]): number {
  let n = 0
  for (const node of nodes) {
    if (node.type === 'url') n++
    else if (node.children) n += countLinks(node.children)
  }
  return n
}

/** Chrome profiles (dir + display name + bookmark-bar link count) on this Mac. */
export function listChromeProfiles(): ChromeProfile[] {
  if (!existsSync(CHROME_DIR)) return []

  const names: Record<string, string> = {}
  try {
    const localState = JSON.parse(readFileSync(join(CHROME_DIR, 'Local State'), 'utf8'))
    const cache = localState?.profile?.info_cache ?? {}
    for (const key of Object.keys(cache)) names[key] = cache[key]?.name ?? key
  } catch {
    // names are best-effort
  }

  const profiles: ChromeProfile[] = []
  for (const entry of readdirSync(CHROME_DIR)) {
    const bookmarksPath = join(CHROME_DIR, entry, 'Bookmarks')
    if (!existsSync(bookmarksPath)) continue
    let count = 0
    try {
      const data = JSON.parse(readFileSync(bookmarksPath, 'utf8'))
      count = countLinks(data?.roots?.bookmark_bar?.children ?? [])
    } catch {
      // skip unreadable
    }
    profiles.push({ dir: entry, name: names[entry] ?? entry, count })
  }
  return profiles.sort((a, b) => b.count - a.count)
}

function convert(nodes: RawNode[]): BookmarkNode[] {
  const out: BookmarkNode[] = []
  for (const node of nodes) {
    if (node.type === 'url' && node.url) {
      out.push({ type: 'link', id: randomUUID(), title: node.name || node.url, url: node.url })
    } else if (node.type === 'folder') {
      out.push({
        type: 'folder',
        id: randomUUID(),
        title: node.name || 'Folder',
        children: convert(node.children ?? [])
      })
    }
  }
  return out
}

/** Read and convert a Chrome profile's "Bookmarks bar" tree. */
export function readChromeBookmarkBar(dir: string): BookmarkNode[] {
  const data = JSON.parse(readFileSync(join(CHROME_DIR, dir, 'Bookmarks'), 'utf8'))
  return convert(data?.roots?.bookmark_bar?.children ?? [])
}
