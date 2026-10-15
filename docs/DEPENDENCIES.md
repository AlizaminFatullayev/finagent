# Dependencies

Every third-party package and why it is here. Figures were checked with `npm view`, the npm downloads API and
`npm audit` when the package was added (October 2026). Anything that is ~10 lines of code is written in-house
instead (see the bottom of this file).

## Runtime

| Package | Version | Last publish | Weekly downloads | Why |
| --- | --- | --- | --- | --- |
| express | 5.3.0 | 2026-10 | 145M | HTTP framework; v5 forwards rejected async handlers to the error middleware. |
| zod | 4.6.7 | 2026-10 | 347M | Single source of truth for env config, request validation and OpenAPI. |
| @asteasolutions/zod-to-openapi | 9.1.0 | 2026-07 | 5.2M | Generates the OpenAPI 3.1 document from the same Zod schemas used for validation. |
| swagger-ui-express | 5.0.1 | 2024-05 | 4.3M | Serves Swagger UI at `/docs`; stable, tiny surface, no maintained alternative with the same reach. |
| @prisma/client, @prisma/adapter-pg, pg | 7.10.0 / 8.23.1 | 2026-08/09 | 18M / 6.7M / 65M | ORM with typed queries and migrations; Prisma 7 talks to Postgres through the `pg` driver adapter. |
| ioredis | 6.0.0 | 2026-07 | 31M | Redis client shared by BullMQ, rate limiting, cache and pub/sub. |
| bullmq | 6.3.15 | 2026-10 | 9.7M | Durable Redis-backed queues with retries, backoff and progress. |
| socket.io | 4.8.4 | 2026-09 | 19M | Real-time progress to the browser with rooms and auth middleware. |
| pino, pino-http | 10.4.0 / 11.0.0 | 2026-10 / 2025-10 | 54M / 6.5M | Fast structured JSON logging with built-in redaction. |
| helmet | 8.3.0 | 2026-07 | 16M | Sensible security headers in one call. |
| cors | 2.8.6 | 2026-01 | 87M | Origin allowlist for the future React client. |
| express-rate-limit, rate-limit-redis | 8.7.1 / 6.0.1 | 2026-10 / 2026-08 | 70M / 1.3M | Rate limiting whose counters live in Redis, so limits hold across API replicas. |
| jose | 6.2.12 | 2026-09 | 155M | JWT sign/verify; zero dependencies, ESM-native, maintained. Chosen over `jsonwebtoken` (CJS, callback API). |
| argon2 | 0.45.1 | 2026-07 | 2.6M | Argon2id password hashing (OWASP first choice); ships prebuilt binaries, so no compiler in Docker. Chosen over bcrypt (72-byte input limit). |
| multer | 2.4.0 | 2026-09 | 23M | Multipart parsing with file size limits; v2 fixes the v1 DoS advisories. |
| exceljs | 4.4.0 | 2023-10 | 18M | xlsx reader/writer plus an RFC 4180 CSV parser (fast-csv) in one package. Release cadence is slow, but the npm `xlsx` (SheetJS) package is stale and has open advisories, so exceljs remains the safer choice. Its streaming reader is not used: in 4.4.0 it drops sheets and sheet names depending on zip entry order and stream chunking (reproduced in this project). Its `uuid` dependency is pinned to a patched version via `overrides`. |
| yauzl | 3.4.0 | 2026-06 | 54M | Reads the zip central directory to measure uncompressed size before parsing (zip-bomb guard). |
| pdfkit | 0.20.2 | 2026-08 | 11M | PDF report generation with standard fonts and no headless browser. `pdfmake` was considered, but our tables are simple enough that its extra layer is not worth it. |
| dejavu-fonts-ttf | 2.37.3 | 2022-06 | 200K | DejaVu Sans TTF for PDF reports: PDF standard fonts cannot render Azerbaijani letters (ə, ğ, ş, ı). Font files are static, so the old publish date is not a maintenance concern; license is the permissive Bitstream Vera/DejaVu license. |
| @anthropic-ai/sdk | 0.133.0 | 2026-10 | 46M | Official client for the default LLM provider (tool use, retries, typed errors). |

## Development

| Package | Why |
| --- | --- |
| prisma 7.10.0 | Migration and code-generation CLI. |
| typescript 6.0.x | Type checking. Pinned below 6.1 because typescript-eslint supports `<6.1`. |
| tsx | Runs TypeScript directly for dev, scripts and the seed. |
| vitest, supertest, socket.io-client | Unit, HTTP integration and WebSocket integration tests. |
| eslint, @eslint/js, typescript-eslint, prettier, eslint-config-prettier | Linting and formatting. |
| @types/* | Type definitions for packages that do not ship their own. |

## Known audit findings

`npm audit` reports advisories in `mysql2` and `deepmerge-ts`, pulled in only by the Prisma **CLI** (`prisma`,
`@prisma/config`). We use PostgreSQL, never load `mysql2`, and the CLI only merges our own static config. The
only offered fix is downgrading to Prisma 6, which conflicts with the Prisma 7 requirement. Re-check on each
Prisma release.

## Written in-house on purpose (small enough not to need a package)

- Env file loading: Node's built-in `process.loadEnvFile` (no `dotenv`).
- AES-256-GCM vault and HMAC webhook signatures: `node:crypto`.
- SSRF IP checks: `node:net` `BlockList` plus a custom DNS `lookup` on the outgoing request.
- Worker-to-API event forwarding: a single Redis pub/sub channel (~20 lines) instead of `@socket.io/redis-emitter`.
- Statistics, anomaly rules and Benford's law: plain TypeScript, so every number is auditable.

## Client

Checked with `npm view`, the npm downloads API (last week) and `npm audit` (0 advisories) in October 2026.
Accessible primitives (dialog, drawer, menu, tabs, tooltip, toast) come from maintained headless packages;
anything that is a few lines is written in-house (see the end of this section).

### Runtime

| Package | Version | Last publish | Weekly downloads | Why |
| --- | --- | --- | --- | --- |
| react, react-dom | 19.3.1 | 2026-10 | 188M / 177M | UI library named by the design handoff. |
| react-router | 8.4.0 | 2026-10 | 57M | Routing with nested layouts, guards and lazy routes. |
| @tanstack/react-query | 5.104.3 | 2026-10 | 65M | Server-state cache, retries and socket-driven invalidation; the reveal call runs with `gcTime: 0`. |
| radix-ui | 1.8.1 | 2026-10 | 17M | Headless, accessible dialog, dropdown menu, tabs, tooltip and accordion (focus trap, focus return, keyboard). One tree-shaken package instead of one per primitive. |
| sonner | 2.0.8 | 2026-08 | 49M | Toast queue with an `aria-live` region; rendered with the design's own toast markup. |
| recharts | 3.10.1 | 2026-10 | 55M | Line, bar, histogram and donut charts colored from CSS variables. `react-is` is its peer dependency. |
| socket.io-client | 4.8.4 | 2026-09 | 16M | Matches the server's Socket.IO 4 (handshake `auth.token`, reconnects). |
| openapi-fetch | 0.17.0 | 2026-06 | 11M | 6 kB typed fetch wrapper over the generated OpenAPI types; no hand-written request shapes. |
| @fontsource-variable/geist, @fontsource-variable/jetbrains-mono | 5.3.0 | 2026-07 | 3.3M / 2.0M | Self-hosted design fonts (no CDN): only the latin and latin-ext files are bundled. |

### Development

| Package | Why |
| --- | --- |
| vite 8, @vitejs/plugin-react | Dev server with `/api` and `/socket.io` proxy, production build. |
| tailwindcss 4, @tailwindcss/vite | Utilities mapped onto the design tokens with `@theme inline`; default palettes are cleared. |
| typescript 5.9 | Type checking. Kept on 5.x because `openapi-typescript` 7 declares `typescript@^5` as a peer. |
| openapi-typescript 7.13 | Generates `src/api/schema.d.ts` from `docs/openapi.json` (`npm run api:types`). |
| vitest 5, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom | Unit and component tests. |
| msw 3 | Mocks the HTTP API at the network level in component tests. |
| @playwright/test, @axe-core/playwright | Local e2e smoke, design screenshots and accessibility checks (not run in CI). |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, eslint-config-prettier, prettier | Linting and formatting, same settings as `server/`. |
| @types/react, @types/react-dom, @types/node | Type definitions. |

### Written in-house on purpose

- Class joining: a one-line helper instead of `clsx` / `tailwind-merge` (components use the design's own classes).
- Drag and drop: native drag events (about 25 lines) instead of `react-dropzone`.
- Upload progress: one `XMLHttpRequest` helper (fetch cannot report upload progress); no axios.
- Icons: the 36 thin-stroke SVG paths from the design in one `Icon` component, so strokes match exactly; no icon package.
- Forms: controlled inputs and the server's 422 field errors; no form or schema library for five small forms.
- Countdown timers, token parsing, cursor stacks, theme persistence.
