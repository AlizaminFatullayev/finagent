# FinAgent web client

Browser client for FinAgent: upload Excel/CSV workbooks, follow parsing and analysis live, read the
summary, anomalies and charts, reveal masked values with an audited reason, and export reports. Admins also
manage users, the audit log and webhooks.

It talks only to the FinAgent API in `../server` and follows the design export in `../finagent-design`.

## Stack

React 19, TypeScript (strict), Vite 8, Tailwind CSS 4 mapped onto the design tokens, Radix primitives,
TanStack Query, React Router, Socket.IO client, Recharts, openapi-fetch with types generated from
`docs/openapi.json`. Tests: Vitest, Testing Library, MSW; local e2e with Playwright and axe. Package choices
are justified in [`docs/DEPENDENCIES.md`](../docs/DEPENDENCIES.md#client).

## Run

Requires Node 22.22+ and the backend running on `http://localhost:3000` (see the root README).

```bash
cd client
npm ci
npm run dev        # http://localhost:5173, proxies /api and /socket.io to the API
```

The dev server proxies the API and the WebSocket, so the browser sees a single origin and the backend CORS
allowlist needs no change.

| Variable                                                                  | Default                 | Purpose                                                                                            |
| ------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `VITE_PROXY_TARGET`                                                       | `http://localhost:3000` | Where the dev server proxies `/api` and `/socket.io`.                                              |
| `VITE_API_URL`                                                            | same origin             | API origin baked into a production build, if the API lives elsewhere.                              |
| `VITE_UPLOAD_MAX_BYTES`, `VITE_UPLOAD_MAX_SHEETS`, `VITE_UPLOAD_MAX_ROWS` | server defaults         | Limits shown in the upload copy and used for the size pre-check. The API does not expose them yet. |

## Scripts

| Command                                                       | What it does                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                                                 | Dev server with hot reload.                                   |
| `npm run build`                                               | Type check and production build into `dist/` (no sourcemaps). |
| `npm run preview`                                             | Serve the production build locally.                           |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | Static checks.                                                |
| `npm test`                                                    | Unit and component tests (Vitest, jsdom, MSW).                |
| `npm run api:types`                                           | Regenerate `src/api/schema.d.ts` from `../docs/openapi.json`. |

## Structure

```
src/
  api/          generated OpenAPI types, typed client, error envelope, upload and download helpers
  auth/         in-memory session, single-flight refresh, guards
  styles/       design tokens (verbatim from fa.css), ported component styles, fonts
  lib/          theme, formatting, token parsing
docs/           API_GAPS.md (contract gaps), DESIGN_DIFF.md (design verification log)
```

## Design tokens and theme

`src/styles/globals.css` holds the `:root` (light) and `.dark` variables copied verbatim from
`finagent-design/assets/fa.css`; `src/styles/tokens.test.ts` fails if a name or value drifts (it runs
wherever the design export is present). Tailwind maps the variables through `@theme inline`, and its default
palettes, radii and type sizes are cleared, so only design values exist. Component classes (`.btn`, `.tok`,
`.card`, ...) are ported from `fa.css` into `src/styles/components.css`, so markup matches the design pages
one to one.

Dark mode is the `.dark` class on `<html>`, applied in `main.tsx` before the first render from the saved
choice (localStorage) or the system preference.

## Typed API

`npm run api:types` turns `docs/openapi.json` into `src/api/schema.d.ts` (committed). `src/api/client.ts`
wraps it with openapi-fetch; `unwrap()` returns the `data` body or throws an `ApiError` built from the
backend envelope `{ error: { code, message, details, requestId } }`, including `Retry-After` on 429s.
Regenerate the types whenever the server contract changes.

## Security notes

- **Access token in memory only.** The refresh token is in `sessionStorage` because the API returns it in
  the JSON body; it is single-use and rotated on every refresh. Concurrent 401s share one refresh request.
  Moving it to an `httpOnly` cookie needs a backend change (see `docs/API_GAPS.md`).
- **Revealed PII stays in component memory.** Never in storage, URLs, the query cache, logs or test
  snapshots; it is re-masked after 60 seconds, on page leave and on logout.
- No `dangerouslySetInnerHTML`; every server string is rendered as text. ESLint forbids both it and
  `console.log`.
- Fonts are bundled; the app loads nothing from third-party origins.

See [`docs/API_GAPS.md`](docs/API_GAPS.md) for what the API does not provide yet and how the UI degrades.
