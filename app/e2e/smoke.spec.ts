import { expect, test } from '@playwright/test'

test('search, watch, build, watchlist, export', async ({ page }) => {
  await page.goto('./')

  // Search → part page → chart → Watch
  await page.getByRole('searchbox', { name: 'Search parts' }).fill('4070')
  await page.getByRole('link', { name: /GeForce RTX 4070/ }).click()
  await expect(page.getByRole('heading', { name: 'NVIDIA GeForce RTX 4070' })).toBeVisible()
  await page.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: 'All' }).click() // fixture dates are fixed, so don't depend on "last 90 days"
  await expect(page.locator('.chart svg.recharts-surface')).toBeVisible()
  await page.getByRole('button', { name: 'Watch' }).click()
  await expect(page.getByRole('button', { name: 'Unwatch' })).toBeVisible()

  // Build → New build → Choose… CPU → total updates → 3D canvas (or its fallback without WebGL)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Build' }).click()
  await page.getByRole('button', { name: 'New build' }).click()
  await expect(page.getByText('Total: $0.00')).toBeVisible()
  await page.getByRole('link', { name: 'Choose… CPU' }).click()
  await expect(page.getByRole('heading', { name: 'Choose CPU' })).toBeVisible()
  await page.getByRole('button', { name: /Ryzen 7 7800X3D/ }).click()
  await expect(page.getByText('Total: $349.99')).toBeVisible()
  const scene = page.locator('canvas').or(page.getByText('3D preview unavailable'))
  await expect(scene.first()).toBeVisible()
  test.info().annotations.push({ type: '3d', description: (await page.locator('canvas').count()) ? 'canvas rendered' : 'fallback rendered' })

  // Watchlist lists the watched part
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Watchlist' }).click()
  await expect(page.getByText('NVIDIA GeForce RTX 4070')).toBeVisible()

  // Settings → Export now downloads watchlist.csv first
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export now' }).click()
  expect((await download).suggestedFilename()).toBe('watchlist.csv')
  await expect(page.getByRole('status').filter({ hasText: 'Backup saved.' })).toBeVisible()
})
