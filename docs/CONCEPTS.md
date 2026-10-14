# Backend concepts map

Where each backend concept lives in this codebase. Paths are relative to `server/` unless noted.

| Concept | What it means here | Where |
| --- | --- | --- |
| REST | Resource-oriented routes (`/api/files/{id}/analyses`), nouns + HTTP verbs, one envelope for every response | `src/modules/*/routes.ts`, `src/lib/http.ts` |
| Status codes | 200 read, 201 created / served from cache, 202 queued, 400/401/403/404/409/413/422/429, 500, 502 for LLM upstream failures | `src/lib/errors.ts`, `src/modules/files/controller.ts`, `src/modules/analyses/controller.ts` |
| Middleware | Ordered request pipeline: request id → logging → helmet → CORS → body limit → rate limit → routes → 404 → error handler | `src/app.ts`, `src/middleware/` |
| Controller | Thin HTTP adapters: read the validated request, call a service, send the envelope | `src/modules/*/controller.ts` |
| Service layer | Business rules, ownership checks, transactions; no HTTP objects | `src/modules/*/service.ts` |
| Validation | Zod schemas for body/query/params; all failures in one 422 with field details | `src/middleware/validate.ts`, `src/modules/*/schemas.ts`, `src/config/env.ts` |
| Error handling | Typed `AppError` subclasses; library errors mapped in one place; unknown errors become an opaque 500 with a request id | `src/lib/errors.ts`, `src/middleware/errorHandler.ts` |
| Authentication (AuthN) | Email + password login, short-lived access token, rotating refresh token, lockout after failed attempts | `src/modules/auth/service.ts`, `src/middleware/auth.ts` |
| Authorization (AuthZ) | Role guard per route plus row-level ownership in services (analyst = own files, manager/admin = all); PII reveal additionally limited by `UNMASK_ALLOWED_ROLES` and audited with a reason | `src/middleware/rbac.ts`, `src/modules/files/service.ts` (`visibleTo`, `revealTokens`) |
| JWT | HS256 access tokens with issuer, audience, expiry and an algorithm allowlist | `src/lib/jwt.ts` |
| Hashing | Argon2id for passwords; SHA-256 for refresh tokens and file fingerprints; HMAC-SHA256 for webhook signatures; AES-256-GCM for the PII vault | `src/modules/users/service.ts`, `src/lib/crypto.ts` |
| CORS | Origin allowlist from env, shared by REST and Socket.IO | `src/app.ts`, `src/realtime/socket.ts` |
| Rate limiting | Redis-backed counters: global per IP, strict on `/api/auth/*`, per user on analysis creation and on PII reveal | `src/middleware/rateLimit.ts` |
| Env vars / config | Validated once at boot with Zod; fails fast with a readable list; refuses placeholder secrets in production | `src/config/env.ts`, `.env.example` (root) |
| ORM | Prisma 7 with the `pg` driver adapter; typed queries, one client per process | `prisma/schema.prisma`, `src/lib/prisma.ts`, `prisma.config.ts` |
| Schema | Models, enums and relations in one file | `prisma/schema.prisma` |
| Migration | Versioned SQL, including an append-only trigger on the audit log | `prisma/migrations/` |
| Relations | User → File → Sheet → DataRow, File → Analysis, Webhook → WebhookDelivery, cascade vs restrict deletes | `prisma/schema.prisma` |
| Indexes | Every foreign key and list path indexed, e.g. `File(ownerId, createdAt)`, `File(ownerId, sha256)`, `DataRow(sheetId, rowIndex)`, `Analysis(cacheKey, status)` | `prisma/schema.prisma` |
| Transactions | Data change + audit entry commit together; ingest writes rows and READY status atomically | `src/modules/*/service.ts`, `src/queue/processors/ingest.ts` |
| N+1 avoidance | File detail with sheets in one query (`select` with nested relation); analysis loads all rows in one query | `src/modules/files/service.ts` (`getFile`), `src/queue/processors/analyze.ts` |
| Seeding | Idempotent demo users from env, refused in production | `prisma/seed.ts` |
| Caching | Analysis results keyed by content hash + params + algorithm version + model, looked up in Redis then the DB; chart specs cached in Redis per analysis cache key + `CHARTS_VERSION` | `src/modules/analyses/service.ts` (`computeCacheKey`, `getCharts`), `src/domain/analysis/charts.ts` |
| Pagination | Keyset (cursor) pagination, newest first, `meta.nextCursor` | `src/lib/pagination.ts`, `src/modules/files/service.ts` (`getRows`) |
| Queues / background jobs | BullMQ queues with retries, exponential backoff, progress; a separate worker process | `src/queue/queues.ts`, `src/queue/processors/`, `src/worker.ts` |
| WebSocket | Socket.IO with JWT handshake and per-user rooms | `src/realtime/socket.ts` |
| Pub/sub | Worker publishes progress to a Redis channel; every API instance forwards to its sockets | `src/realtime/events.ts`, `src/realtime/socket.ts` |
| OpenAPI | OpenAPI 3.1 generated from the same Zod schemas used for validation; Swagger UI at `/docs`; exported to `docs/openapi.json` | `src/lib/openapi.ts`, `scripts/export-openapi.ts`, `docs/openapi.json` (root) |
| Webhooks | Admin-managed subscriptions, HMAC-signed deliveries with timestamp, retries, delivery log, SSRF protection | `src/modules/webhooks/`, `src/queue/processors/webhookDelivery.ts`, `src/lib/ssrf.ts` |
| Docker | Multi-stage image (build → migrate → runtime), non-root user, healthcheck; compose for db, redis, migrate, api, worker | `Dockerfile`, `docker-compose.yml` (root) |
| CI/CD | GitHub Actions with Postgres and Redis service containers: typecheck, lint, format, unit, integration, build, docker build | `.github/workflows/ci.yml` (root) |
| Logging | Structured JSON with pino, request ids, redaction of credentials | `src/lib/logger.ts`, `src/app.ts` |
| Idempotency | Same user + same file hash returns the existing file; queue job ids equal entity ids so retries do not duplicate work | `src/modules/files/service.ts` (`uploadFile`), `src/modules/analyses/service.ts` |
