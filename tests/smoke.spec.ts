import { test, expect } from '@playwright/test'
import { launchFlit } from './launch'

// Phase 0 boot smoke test. Launches the built Electron app and asserts the
// window opens with the Flit title and the sidebar shell rendered.
test('boots with a Flit window and sidebar', async () => {
  const app = await launchFlit()

  const window = await app.firstWindow()
  await expect(window).toHaveTitle(/Flit/)

  const sidebar = window.locator('[data-testid="sidebar"]')
  await expect(sidebar).toBeVisible()

  await app.close()
})

// Multi-window: a second window opens independently and shares the same app.
test('opens a second independent window', async () => {
  const app = await launchFlit()

  const first = await app.firstWindow()
  await first.locator('[data-testid="sidebar"]').waitFor()

  const [second] = await Promise.all([
    app.waitForEvent('window'),
    first.evaluate(() => window.flit.newWindow())
  ])

  await expect(second).toHaveTitle(/Flit/)
  await second.locator('[data-testid="sidebar"]').waitFor()
  expect(app.windows().length).toBeGreaterThanOrEqual(2)

  await app.close()
})
