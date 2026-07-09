import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Launch the built app against a throwaway userData + shared-config dir, so
 * tests never collide with a running Flit's single-instance lock and never
 * read or mutate the user's real profiles/sessions/settings.
 */
export async function launchFlit(): Promise<ElectronApplication> {
  const base = mkdtempSync(join(tmpdir(), 'flit-test-'))
  return electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...(process.env as Record<string, string>),
      FLIT_USER_DATA_DIR: join(base, 'userData'),
      FLIT_SHARED_DIR: join(base, 'shared')
    }
  })
}
