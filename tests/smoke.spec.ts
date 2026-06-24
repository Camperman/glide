import { test, expect } from '@playwright/test'
import { launchGlide } from './launch'

// Phase 0 boot smoke test. Launches the built Electron app and asserts the
// window opens with the Glide title and the sidebar shell rendered.
test('boots with a Glide window and sidebar', async () => {
  const app = await launchGlide()

  const window = await app.firstWindow()
  await expect(window).toHaveTitle(/Glide/)

  const sidebar = window.locator('[data-testid="sidebar"]')
  await expect(sidebar).toBeVisible()

  await app.close()
})

// Multi-window: a second window opens independently and shares the same app.
test('opens a second independent window', async () => {
  const app = await launchGlide()

  const first = await app.firstWindow()
  await first.locator('[data-testid="sidebar"]').waitFor()

  const [second] = await Promise.all([
    app.waitForEvent('window'),
    first.evaluate(() => window.glide.newWindow())
  ])

  await expect(second).toHaveTitle(/Glide/)
  await second.locator('[data-testid="sidebar"]').waitFor()
  expect(app.windows().length).toBeGreaterThanOrEqual(2)

  await app.close()
})
