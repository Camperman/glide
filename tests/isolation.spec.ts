import { test, expect } from '@playwright/test'
import { launchGlide } from './launch'

// The headline requirement (REQUIREMENTS.md §6.2): per-account sessions must be
// fully isolated. A cookie set in one account's partition MUST NOT appear in
// another's, and every account MUST have a distinct partition. This test talks
// to the main process via window.glide.__test, so it needs no page loads.
test('account sessions are isolated', async () => {
  const app = await launchGlide()

  const page = await app.firstWindow()
  await expect(page).toHaveTitle(/Glide/)

  const partitions = await page.evaluate(() => window.glide.__test.partitions())
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
      window.glide.__test.setCookie({ partition: partA, url, name: 'glide_iso', value: 'A' }),
    { partA, url }
  )

  const aCookies = await page.evaluate(
    ({ partA, url }) => window.glide.__test.getCookies({ partition: partA, url }),
    { partA, url }
  )
  const bCookies = await page.evaluate(
    ({ partB, url }) => window.glide.__test.getCookies({ partition: partB, url }),
    { partB, url }
  )

  expect(aCookies.some((c) => c.name === 'glide_iso')).toBe(true)
  expect(bCookies.some((c) => c.name === 'glide_iso')).toBe(false)

  await app.close()
})
