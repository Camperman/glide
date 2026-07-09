import { test, expect } from '@playwright/test'
import { launchFlit } from './launch'

// The headline requirement (REQUIREMENTS.md §6.2): per-account sessions must be
// fully isolated. A cookie set in one account's partition MUST NOT appear in
// another's, and every account MUST have a distinct partition. This test talks
// to the main process via window.flit.__test, so it needs no page loads.
test('account sessions are isolated', async () => {
  const app = await launchFlit()

  const page = await app.firstWindow()
  await expect(page).toHaveTitle(/Flit/)

  // Fresh installs seed a single account (Phase 28 onboarding); add a second
  // through the real account API so isolation is provable.
  const initial = await page.evaluate(() => window.flit.__test.partitions())
  if (Object.keys(initial).length < 2) {
    await page.evaluate(() =>
      window.flit.addAccount({
        label: 'Second',
        color: '#34a853',
        homeUrl: 'https://mail.google.com'
      })
    )
    await page.waitForTimeout(300)
  }

  const partitions = await page.evaluate(() => window.flit.__test.partitions())
  const ids = Object.keys(partitions)
  const values = Object.values(partitions)

  // At least two accounts, all with distinct partitions.
  expect(ids.length).toBeGreaterThanOrEqual(2)
  expect(new Set(values).size).toBe(values.length)

  const partA = partitions[ids[0]]
  const partB = partitions[ids[1]]
  const url = 'https://example.com'

  // Set a cookie in account A's session only.
  await page.evaluate(
    ({ partA, url }) =>
      window.flit.__test.setCookie({ partition: partA, url, name: 'flit_iso', value: 'A' }),
    { partA, url }
  )

  const aCookies = await page.evaluate(
    ({ partA, url }) => window.flit.__test.getCookies({ partition: partA, url }),
    { partA, url }
  )
  const bCookies = await page.evaluate(
    ({ partB, url }) => window.flit.__test.getCookies({ partition: partB, url }),
    { partB, url }
  )

  expect(aCookies.some((c) => c.name === 'flit_iso')).toBe(true)
  expect(bCookies.some((c) => c.name === 'flit_iso')).toBe(false)

  await app.close()
})
