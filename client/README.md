# FinAgent web client

Browser client for FinAgent: upload Excel/CSV workbooks, follow parsing and analysis live, read the
summary, anomalies and charts, reveal masked values with an audited reason, and export reports. Admins also
manage users, the audit log and webhooks.

It talks only to the FinAgent API in `../server` and follows the design export in `../finagent-design`.

## Stack

React 19, TypeScript (strict), Vite 8, Tailwind CSS 4 mapped onto the design tokens, Radix primitives,
TanStack Query, React Router, Socket.IO client, Recharts, openapi-fetch with types generated from
`docs/openapi.json`. Tests: Vitest, Testing Library, MSW; local e2e and design checks with Playwright and
axe. Package choices are justified in [`docs/DEPENDENCIES.md`](../docs/DEPENDENCIES.md#client).

## Quickstart

Requires Node 22.22+ and Docker.

```bash
# 1. Backend (from the repository root; see the root README for details)
docker compose up -d db redis
cd server && npm ci && npm run db:deploy && npm run db:seed
LLM_PROVIDER=mock npm run dev          # API on :3000 and the worker

# 2. Client
cd ../client
npm ci
npm run dev                            # http://localhost:5173
```

Sign in with a seed user from `.env.example` (local development only). The dev server proxies `/api` and
`/socket.io` (WebSocket included) to the API, so the browser sees a single origin and the backend CORS
allowlist needs no change.

| Variable                                                                  | Default                 | Purpose                                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `VITE_PROXY_TARGET`                                                       | `http://localhost:3000` | Where the dev server proxies `/api` and `/socket.io`.                                                                    |
| `VITE_API_URL`                                                            | same origin             | API origin baked into a production build, if the API lives elsewhere.                                                    |
| `VITE_UPLOAD_MAX_BYTES`, `VITE_UPLOAD_MAX_SHEETS`, `VITE_UPLOAD_MAX_ROWS` | 20 MB, 20, 200,000      | Limits shown in the upload copy and used for the size pre-check (the server defaults). The API does not expose them yet. |

## Scripts

| Command                                                       | What it does                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                                                 | Dev server with hot reload.                                                       |
| `npm run build`                                               | Type check and production build into `dist/` (no sourcemaps, no dev-only routes). |
| `npm run preview`                                             | Serve the production build locally.                                               |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | Static checks (same ESLint/Prettier settings as `server/`).                       |
| `npm test`                                                    | Unit and component tests (Vitest, jsdom, MSW). Runs in CI.                        |
| `npm run api:types`                                           | Regenerate `src/api/schema.d.ts` from `../docs/openapi.json`.                     |
| `npm run e2e`                                                 | Local smoke test against the real stack (see below). Not run in CI.               |
| `npm run screenshots`                                         | Design verification screenshots and checks (see below).                           |

### End-to-end smoke

```bash
cd client
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium   # once; keeps the browser inside node_modules
PLAYWRIGHT_BROWSERS_PATH=0 npm run e2e
```

Playwright brings the stack up if it is not running: `docker compose up -d db redis`, migrations, seed, the
synthetic sample workbook (`npm run sample:xlsx`), the API and the worker with `LLM_PROVIDER=mock` (and
relaxed local rate limits), and the Vite dev server. Running servers are reused. The smoke signs in as every
seeded role, checks that admin pages exist only for admins, uploads a file and waits for parsing, opens the
sample workbook, reveals a token with a reason and watches it re-mask after 60 seconds (fake clock), runs or
reopens an analysis, downloads the Excel and PDF exports, opens charts, anomalies and the affected-rows
drawer, and signs out. Seed credentials come from the environment or `.env.example`; none are in the source.

### Design verification

`npm run screenshots` (backend and `npm run dev` running) captures every implemented screen at 1280x800 and
390x844, in light and, where the design has one, dark. It asserts no horizontal overflow at 390px, 44x44
touch targets on mobile and no critical or serious axe violations on the key screens. Images and a JSON
report land in `.screenshots/` (gitignored); revealed values and one-time secrets are painted over. The
comparison with the design is logged in [`docs/DESIGN_DIFF.md`](docs/DESIGN_DIFF.md).

## Structure

```
src/
  api/          generated OpenAPI types, typed client, error envelope, upload (XHR) and download helpers
  auth/         in-memory session, single-flight refresh, AuthProvider, route guards
  realtime/     Socket.IO provider and the live progress store
  components/   design-system primitives (ui/), shell (sidebar, top bar, mobile tabs), error states
  features/     dashboard, upload, files, reveal, analysis (result, anomalies, charts, export), admin
  styles/       design tokens (verbatim from fa.css), ported component styles, self-hosted fonts
  lib/ hooks/   formatting, token parsing, theme, countdown, media queries
  dev/          /dev/design-system (development builds only)
e2e/            Playwright smoke test
scripts/        design verification screenshots
docs/           API_GAPS.md (contract gaps), DESIGN_DIFF.md (design verification log)
```

## Design tokens and theme

`src/styles/globals.css` holds the `:root` (light) and `.dark` variables copied verbatim from
`finagent-design/assets/fa.css`; `src/styles/tokens.test.ts` fails if a name or value drifts (it runs wherever
the design export is present, so locally, not in CI). Tailwind maps the variables through `@theme inline`;
its default palettes, radii and type sizes are cleared, so only design values exist. The design's component
classes (`.btn`, `.tok`, `.card`, ...) are ported from `fa.css` into `src/styles/components.css`, so markup
matches the design pages one to one; app-specific adaptations (fixed overlays, 44px touch targets) are
appended there and listed in `DESIGN_DIFF.md`. Both CSS files are excluded from Prettier to keep values
verbatim. Charts read the same tokens at runtime, so they follow the theme.

Dark mode is the `.dark` class on `<html>`, applied in `main.tsx` before the first render from the saved
choice (localStorage) or the system preference.

## Typed API

`npm run api:types` turns `docs/openapi.json` into `src/api/schema.d.ts` (committed). `src/api/client.ts`
wraps it with openapi-fetch; `unwrap()` returns `data` and `unwrapBody()` the whole `{ data, meta }` body, or
both throw an `ApiError` built from the backend envelope `{ error: { code, message, details, requestId } }`,
including `Retry-After` on 429s. Regenerate the types whenever the server contract changes; `tsc` then points
at every place that needs an update.

## Security notes

- **Tokens.** The access token lives in memory only. The refresh token is in `sessionStorage` because the
  API returns it in the JSON body; it is single-use and rotated on every refresh, and concurrent 401s share one
  refresh request. Moving it to an `httpOnly` cookie needs a backend change (`docs/API_GAPS.md`, gap 12).
- **Revealed PII stays in component memory.** A page-scoped store holds revealed values for 60 seconds after
  the latest reveal and drops them on page leave, logout and session expiry. They never reach storage, URLs,
  the query cache (the reveal mutation runs with `gcTime: 0`), logs, test snapshots or screenshots.
- **Text only.** No `dangerouslySetInnerHTML`; every server string is rendered as text. ESLint forbids it and
  `console.log`.
- **No third-party origins.** Fonts are bundled; the app loads nothing from other origins.
- **Recommended production headers** (set by the web server, not by this app):
  `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self' <api-origin> <wss-api-origin>; frame-src blob:;
object-src 'none'; base-uri 'none'; frame-ancestors 'none'` (inline styles are used for layout; `frame-src
blob:` is only for the PDF preview), plus `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff` and `Strict-Transport-Security`. Production builds ship without
  sourcemaps and without the `/dev/design-system` route.

## Known gaps

The API does not yet provide dashboard aggregates, file search and filters, owner names, upload limits,
per-column PII flags, lockout details, rows by index, notifications, risk severities, audit resource names,
webhook pause and delivery history, cookie-based refresh, detailed ingest progress or a forced re-run. Each is
described with the UI fallback and a proposed endpoint in [`docs/API_GAPS.md`](docs/API_GAPS.md).
