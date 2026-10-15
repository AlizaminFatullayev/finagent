import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { credentials, type RoleName } from './credentials';

const SAMPLE = fileURLToPath(
  new URL('../../server/samples/synthetic-bank-transactions.xlsx', import.meta.url),
);

async function signIn(page: Page, role: RoleName) {
  const { email, password } = credentials(role);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('every role signs in; admin pages exist only for admins', async ({ page }) => {
  for (const role of ['analyst', 'manager', 'admin'] as const) {
    await signIn(page, role);
    const nav = page.getByRole('navigation', { name: 'Main' }).first();
    if (role === 'admin') {
      await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
      await nav.getByRole('link', { name: 'Audit log' }).click();
      await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
      await nav.getByRole('link', { name: 'Webhooks' }).click();
      await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    } else {
      await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
      await page.goto('/admin/users');
      await expect(page.getByText('You don’t have access to this')).toBeVisible();
    }
    await signOut(page);
  }
});

test('analyst: upload, ingest, analyze, result, charts, anomalies, reveal and re-mask, export', async ({
  page,
}) => {
  await signIn(page, 'analyst');

  // A fresh CSV goes through upload and live parsing to the success state.
  await page.goto('/upload');
  await page.locator('input[type=file]').setInputFiles({
    name: `smoke-${Date.now()}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `Date,Amount,Channel\n2026-01-0${(Date.now() % 9) + 1},${Date.now() % 100000}.25,Branch\n2026-01-02,10.50,ATM\n`,
    ),
  });
  await expect(page.getByText(/is ready$/)).toBeVisible({ timeout: 60_000 });

  // The synthetic workbook (with masked PII): new upload or the deduplicated one.
  await page.getByRole('button', { name: 'Upload another' }).click();
  await page.locator('input[type=file]').setInputFiles(SAMPLE);
  const open = page.getByRole('link', { name: /^(Go to file|Open existing file)$/ });
  await expect(open).toBeVisible({ timeout: 60_000 });
  await open.click();
  await expect(page.getByRole('heading', { name: 'Schema' })).toBeVisible();

  // Reveal one token with a reason, then watch it re-mask after 60 seconds.
  await page.clock.install();
  const show = page.getByRole('button', { name: /^Show [A-Z]+_\d+$/ }).first();
  const token = ((await show.getAttribute('aria-label')) ?? '').replace('Show ', '');
  await show.click();
  await page.getByLabel('Reason for revealing').fill('E2E smoke check of the reveal flow');
  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: `Hide ${token}` })).toBeVisible();
  await expect(page.getByText(/value(s)? revealed\./)).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('button', { name: `Hide ${token}` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Show ${token}` }).first()).toBeVisible();

  // Analysis: start (or reuse the cached one) and land on the result.
  await page.getByRole('button', { name: 'Analyze' }).click();
  const dialog = page.getByRole('dialog');
  const previous = dialog.getByRole('link', { name: 'Open previous result' });
  if (await previous.isVisible()) await previous.click();
  else await dialog.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.getByRole('link', { name: 'View all anomalies' })).toBeVisible({ timeout: 60_000 });
  const resultUrl = page.url();

  // Exports download as files named by the server.
  for (const [label, ext] of [
    ['Excel workbook', 'xlsx'],
    ['PDF report', 'pdf'],
  ] as const) {
    await page.getByRole('button', { name: 'Export' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: new RegExp(`^${ext.toUpperCase()} ${label}`) }).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
  }

  await page.getByRole('link', { name: 'View all charts' }).click();
  await expect(page.getByRole('heading', { name: 'Charts' })).toBeVisible();
  await expect(page.locator('section.chart').first()).toBeVisible();

  await page.goto(`${resultUrl}/anomalies`);
  await expect(page.getByRole('heading', { name: 'Anomalies' })).toBeVisible();
  await page
    .getByRole('button', { name: /^View affected rows/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Affected rows' })).toBeVisible();
  await page.keyboard.press('Escape');

  await signOut(page);
  // After sign-out the session is gone: protected pages go back to sign-in.
  await page.goto('/files');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
