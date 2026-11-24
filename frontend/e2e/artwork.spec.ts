import { expect, test } from '@playwright/test';

test('Studio reports a failed sprite download instead of leaving a loading screen', async ({ page }) => {
  await page.route('**/skater.png', route => route.fulfill({ status: 404, body: 'Missing image' }));
  await page.goto('/studio?sample=flat');
  await expect(page.getByRole('alert')).toContainText('Game artwork could not load');
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeDisabled();
  await expect(page.getByTestId('game-state')).not.toHaveText('Loading…');
});
