import { expect, test } from '@playwright/test';

const unique = () => Math.random().toString(36).slice(2, 10);

test('register, land on the dashboard, run a job and watch it complete live', async ({ page }) => {
  const email = `e2e-${unique()}@example.test`;
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 12 characters')).toBeVisible();
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Welcome, Ada' })).toBeVisible();
  await expect(page.getByText("Ada's workspace").first()).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Job Monitor' }).click();
  await expect(page.getByText('No jobs yet')).toBeVisible();
  await page.getByRole('button', { name: 'Run diagnostic job' }).click();
  // No reload: the row must progress to Completed via Socket.IO-triggered refetches.
  await expect(page.getByText('system.ping')).toBeVisible();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('100%')).toBeVisible();
});

test('session survives a reload (refresh cookie) and sign-out ends it', async ({ page }) => {
  const email = `e2e-${unique()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('Grace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Grace' })).toBeVisible();

  await page.reload(); // access token was in memory only; the httpOnly cookie restores the session
  await expect(page.getByRole('heading', { name: 'Welcome, Grace' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Grace' })).toBeVisible();
});

test('roadmap modules show an honest placeholder, not fake data', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Linus');
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.test`);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Backtesting/ }).click();
  await expect(page.getByText('Arrives in Phase 4')).toBeVisible();
});
