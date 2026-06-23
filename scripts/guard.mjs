// Standing quality gate (REQUIREMENTS.md §6.4): fail the build if any banned
// pattern appears in src/. These break session isolation or security defaults.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BANNED = [
  { pattern: /<webview/i, why: 'use WebContentsView, not the <webview> tag' },
  { pattern: /\bBrowserView\b/, why: 'BrowserView is deprecated; use WebContentsView' },
  { pattern: /nodeIntegration\s*:\s*true/, why: 'nodeIntegration must stay false' },
  { pattern: /contextIsolation\s*:\s*false/, why: 'contextIsolation must stay true' }
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

let failed = false
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  for (const { pattern, why } of BANNED) {
    if (pattern.test(text)) {
      console.error(`GUARD FAIL: ${file} — ${why}`)
      failed = true
    }
  }
}

if (failed) {
  console.error('\nBanned patterns found. See REQUIREMENTS.md §3.1 and §6.4.')
  process.exit(1)
}
console.log('guard: ok')
