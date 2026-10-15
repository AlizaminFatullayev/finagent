// Design verification: screenshots of every implemented screen at 1280x800 and 390x844 (light, and dark
// where the design has a dark variant), plus automated checks: no horizontal overflow at 390px, every
// interactive element at least 44x44 on mobile, and no critical/serious axe violations on key screens.
//
// Usage (backend + `npm run dev` running):  node scripts/screenshots.ts [filter]
// Output: .screenshots/<screen>-<width>[-dark].png and .screenshots/report.json (gitignored).
// Logs in through the real API with the seed users from the environment or ../.env.example.

import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const filter = process.argv[2];

type RoleName = 'admin' | 'manager' | 'analyst';

/** Seed credentials: environment first, then the documented local-dev defaults in .env.example. */
function credentials(role: RoleName) {
  const upper = role.toUpperCase();
  let example: Record<string, string> = {};
  try {
    const text = readFileSync(fileURLToPath(new URL('../../.env.example', import.meta.url)), 'utf8');
    example = Object.fromEntries(
      text
        .split('\n')
        .filter((l) => /^SEED_[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch {
    // Fall through to the environment only.
  }
  const email = process.env[`SEED_${upper}_EMAIL`] ?? example[`SEED_${upper}_EMAIL`];
  const password = process.env[`SEED_${upper}_PASSWORD`] ?? example[`SEED_${upper}_PASSWORD`];
  if (!email || !password) throw new Error(`Missing SEED_${upper}_EMAIL / SEED_${upper}_PASSWORD`);
  return { email, password };
}

export type Screen = {
  name: string;
  /** Path, or a function resolving one from live data (e.g. the newest file). */
  path: string | ((page: Page) => Promise<string>);
  role?: RoleName;
  dark?: boolean;
  /** Key screens get the axe check. */
  axe?: boolean;
  /** Runs after load, e.g. to open a dialog. */
  act?: (page: Page) => Promise<void>;
  /** Only one viewport (component or mobile-only screens). */
  only?: 'desktop' | 'mobile';
};

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

// A wrong password would count towards the lockout of a real seed user, so the error state uses an
// unknown email and the lockout state is simulated by intercepting the login call.
const failLogin = async (page: Page) => {
  await page.getByLabel('Email').fill('nobody@bank.az');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Invalid email or password').waitFor();
};
const lockLogin = async (page: Page) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '872' },
      body: JSON.stringify({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Locked', details: null, requestId: 'r' },
      }),
    }),
  );
  await page.getByLabel('Email').fill('r.karimli@bank.az');
  await page.getByLabel('Password', { exact: true }).fill('wrongpass1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Sign-in is paused for this account').waitFor();
};

export const SCREENS: Screen[] = [
  { name: 'DesignSystem', path: '/dev/design-system', dark: true, only: 'desktop' },
  { name: 'Login', path: '/login', axe: true },
  { name: 'LoginError', path: '/login', dark: true, act: failLogin },
  { name: 'LoginLockout', path: '/login', act: lockLogin, only: 'desktop' },
  { name: 'Shell', path: '/account', role: 'admin' },
  { name: 'Dashboard', path: '/', role: 'manager', axe: true },
  { name: 'DashboardDark', path: '/', role: 'admin', dark: true, only: 'desktop' },
  { name: 'Upload', path: '/upload', role: 'analyst' },
  {
    name: 'UploadDuplicate',
    path: '/upload',
    role: 'analyst',
    only: 'desktop',
    act: async (page) => {
      await apiAs(page, 'analyst').then((a) => a.sampleFile());
      await page.locator('input[type=file]').setInputFiles(SAMPLE_PATH());
      await page.getByText('You already uploaded this file').waitFor();
    },
  },
  { name: 'Files', path: '/files', role: 'manager', axe: true },
  { name: 'FilesAnalyst', path: '/files', role: 'analyst', only: 'desktop' },
  { name: 'FileDetail', path: sampleFilePath('analyst'), role: 'analyst', axe: true },
  {
    name: 'FileDetailRevealed',
    path: sampleFilePath('analyst'),
    role: 'analyst',
    act: async (page) => {
      const show = page.getByRole('button', { name: /^Show \[?[A-Z]+_\d+/ }).first();
      await show.click();
      await page.getByLabel('Reason for revealing').fill('Design verification of the reveal flow');
      await page.getByRole('button', { name: 'Reveal' }).click();
      await page.getByRole('button', { name: 'Done' }).click();
    },
  },
];

const SAMPLE_PATH = () =>
  fileURLToPath(new URL('../../server/samples/synthetic-bank-transactions.xlsx', import.meta.url));

/** API access as a seed user (for setting up data before a screenshot). */
export async function apiAs(page: Page, role: RoleName) {
  const login = await page.request.post(`${BASE}/api/auth/login`, { data: credentials(role) });
  const { accessToken } = (await login.json()).data as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    get: async (path: string) => (await (await page.request.get(`${BASE}${path}`, { headers })).json()).data,
    post: async (path: string, data: unknown) =>
      (await (await page.request.post(`${BASE}${path}`, { headers, data })).json()).data,
    /** Uploads the synthetic sample (deduplicated per user) and waits until it is READY. */
    sampleFile: async (): Promise<string> => {
      const res = await page.request.post(`${BASE}/api/files`, {
        headers,
        multipart: {
          file: {
            name: 'synthetic-bank-transactions.xlsx',
            mimeType: 'application/octet-stream',
            buffer: readFileSync(SAMPLE_PATH()),
          },
        },
      });
      const id = (await res.json()).data.id as string;
      for (let i = 0; i < 60; i++) {
        const f = (await (await page.request.get(`${BASE}/api/files/${id}`, { headers })).json()).data;
        if (f.status === 'READY') return id;
        if (f.status === 'FAILED') throw new Error('sample ingest failed');
        await page.waitForTimeout(1000);
      }
      throw new Error('sample ingest timed out');
    },
  };
}

function sampleFilePath(role: RoleName) {
  return async (page: Page) => `/files/${await (await apiAs(page, role)).sampleFile()}`;
}

async function signIn(page: Page, role: RoleName) {
  const res = await page.request.post(`${BASE}/api/auth/login`, { data: credentials(role) });
  if (!res.ok()) throw new Error(`login as ${role} failed: ${res.status()}`);
  const { refreshToken } = (await res.json()).data as { refreshToken: string };
  // The app restores the session from the refresh token in sessionStorage, as after a reload.
  await page.addInitScript((token) => window.sessionStorage.setItem('finagent.refresh', token), refreshToken);
}

/** Interactive elements smaller than 44x44 (visible ones only). */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const sel =
      'a[href], button, input:not([type=hidden]):not(.sr-only), select, textarea, [role=button], [role=tab], [role=switch], [role=radio]';
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (
          r.width === 0 ||
          r.height === 0 ||
          style.visibility === 'hidden' ||
          el.closest('[aria-hidden=true]')
        )
          return false;
        return r.width < 44 || r.height < 44;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
        return `${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`;
      });
  });
}

async function shoot(browser: Browser, screen: Screen, viewport: keyof typeof VIEWPORTS, dark: boolean) {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(
    (theme) => window.localStorage.setItem('finagent.theme', theme),
    dark ? 'dark' : 'light',
  );
  if (screen.role) await signIn(page, screen.role);
  const path = typeof screen.path === 'string' ? screen.path : await screen.path(page);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  if (screen.act) await screen.act(page);
  await page.waitForTimeout(400);
  const file = `${screen.name}-${VIEWPORTS[viewport].width}${dark ? '-dark' : ''}.png`;
  // Revealed values never end up in an image: their chips are painted over (layout stays visible).
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true, mask: [page.locator('.tok.rev > span')] });

  const result: Record<string, unknown> = { screen: screen.name, file };
  if (viewport === 'mobile') {
    result.overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    result.smallTargets = await smallTargets(page);
  }
  if (screen.axe && !dark) {
    const axe = await new AxeBuilder({ page }).analyze();
    result.axe = axe.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id}: ${v.nodes.length} node(s)`);
  }
  await context.close();
  return result;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report: Record<string, unknown>[] = [];
  for (const screen of SCREENS.filter((s) => !filter || s.name.includes(filter))) {
    for (const viewport of ['desktop', 'mobile'] as const) {
      if (screen.only && screen.only !== viewport) continue;
      for (const dark of screen.dark ? [false, true] : [false]) {
        try {
          report.push(await shoot(browser, screen, viewport, dark));
        } catch (err) {
          report.push({ screen: screen.name, viewport, dark, error: String(err) });
        }
      }
    }
  }
  await browser.close();
  writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
  const failures = report.filter(
    (r) =>
      r.error ||
      r.overflow ||
      (r.smallTargets as string[] | undefined)?.length ||
      (r.axe as string[] | undefined)?.length,
  );
  for (const f of failures) console.error(JSON.stringify(f));
  console.warn(`${report.length} screenshots, ${failures.length} with findings -> ${OUT}`);
  process.exitCode = failures.length ? 1 : 0;
}

await main();
