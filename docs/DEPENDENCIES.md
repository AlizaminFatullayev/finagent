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
