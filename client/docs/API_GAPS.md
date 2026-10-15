# API gaps

What each screen needs, which endpoint serves it, and what the client does where the API has nothing yet.
The source of truth for the contract is `docs/openapi.json`; nothing below assumes a field that is not in it.
This file is the spec for a later backend phase: every **missing** row ends with the proposed addition.

Status legend: **covered** (served as is), **derived** (computed in the browser from existing endpoints),
**missing** (not available; the UI hides the control or shows a documented fallback).

## Coverage matrix

| Screen           | Data needed                                                    | Endpoint                                                                                         | Status                                                                                              |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Login            | Sign in, token pair, profile                                   | `POST /api/auth/login` (user in `TokenPair`)                                                     | covered                                                                                             |
| Login            | "N attempts left before a temporary lock"                      | none                                                                                             | **missing** (gap 6)                                                                                 |
| Login, lockout   | Remaining lock time                                            | none (the lockout 429 has no `Retry-After`)                                                      | **missing** (gap 6)                                                                                 |
| Session          | Restore after reload, rotate tokens                            | `POST /api/auth/refresh`                                                                         | covered                                                                                             |
| Session          | Logout                                                         | `POST /api/auth/logout`                                                                          | covered                                                                                             |
| Top bar          | Name, role                                                     | `GET /api/auth/me`, `TokenPair.user`                                                             | covered                                                                                             |
| Top bar          | Notification indicator and list                                | Socket.IO events of the current session                                                          | **derived** (gap 8)                                                                                 |
| Dashboard        | Files uploaded (30 days), files processing now                 | `GET /api/files` (first 100)                                                                     | **derived**, approximate when more than 100 files (gap 1)                                           |
| Dashboard        | Analyses run, anomalies found                                  | `GET /api/files/{id}/analyses?limit=1` for the newest READY files                                | **derived**, approximate (gap 1)                                                                    |
| Dashboard        | "Avg. 3 min per file"                                          | none                                                                                             | **missing**, line hidden (gap 1)                                                                    |
| Dashboard        | Recent analyses across files                                   | per-file analyses of the newest files                                                            | **derived** (gap 1)                                                                                 |
| Dashboard        | In progress (live)                                             | `GET /api/files` + `file:ingest:progress`, `analysis:progress`                                   | covered (analyses started in other sessions appear only after their first socket event)             |
| Upload           | Upload with progress                                           | `POST /api/files` (XHR for upload progress)                                                      | covered                                                                                             |
| Upload           | Duplicate detection                                            | `200` + `meta.deduplicated: true`                                                                | covered                                                                                             |
| Upload           | Parsing stage, percent                                         | `file:ingest:progress { fileId, stage, percent, status }`                                        | covered ("sheet 2 of 3" and "31,400 of 46,902 rows" are not in the event)                           |
| Upload           | Limits (size, sheets, rows) for copy and pre-checks            | none                                                                                             | **missing** (gap 4): build-time config mirroring `server/.env.example`                              |
| Upload           | Wrong format / corrupted / too large / too many sheets or rows | `400 UNSUPPORTED_FILE`, `413 PAYLOAD_TOO_LARGE`, ingest `FAILED` + `errorMessage`                | covered (sheet and row limit failures arrive asynchronously, as `errorMessage`)                     |
| Files            | List, cursor "Load more"                                       | `GET /api/files`                                                                                 | covered                                                                                             |
| Files            | Search by name, status filter                                  | none                                                                                             | **derived** over loaded pages, labelled as such (gap 2)                                             |
| Files            | Owner column and filter                                        | `ownerId` only                                                                                   | **derived**: "You" for own files, names for admins via `GET /api/users`, short id otherwise (gap 3) |
| Files            | Sheet count per file                                           | none in the list                                                                                 | **missing**, column hidden (gap 2)                                                                  |
| Files            | Delete (owner or admin)                                        | `DELETE /api/files/{id}`                                                                         | covered                                                                                             |
| File detail      | Header, sheets, inferred schema                                | `GET /api/files/{id}`                                                                            | covered                                                                                             |
| File detail      | "Masking" column (which columns hold PII)                      | none per column                                                                                  | **derived** from tokens seen in the loaded preview rows (gap 5)                                     |
| File detail      | Masked preview, Previous / Next                                | `GET /api/files/{id}/rows` (forward cursor; the client keeps a cursor stack)                     | covered                                                                                             |
| File detail      | Owner name                                                     | `ownerId` only                                                                                   | **derived** as on Files (gap 3)                                                                     |
| Reveal           | Reveal tokens with a reason                                    | `POST /api/files/{id}/unmask`                                                                    | covered (values never leave component memory)                                                       |
| Start analysis   | Language, focus columns                                        | `POST /api/files/{id}/analyses`                                                                  | covered                                                                                             |
| Start analysis   | "A previous result is available"                               | `GET /api/files/{id}/analyses` (newest COMPLETED with the same language and columns)             | **derived** before submit; `201` with `cached: true` after submit                                   |
| Progress         | Stage and percent                                              | `analysis:progress { stage, percent }`, polling `GET /api/analyses/{id}` when the socket is down | covered                                                                                             |
| Progress, failed | Code, message                                                  | `error { code, message }`, `analysis:failed`                                                     | covered (the stage that failed is inferred from the code)                                           |
| Result           | Headline, metrics, sections, verification, model, cached       | `GET /api/analyses/{id}`                                                                         | covered                                                                                             |
| Result           | Severity per risk                                              | none (risks are plain strings)                                                                   | **missing**, no badge on risks (gap 9)                                                              |
| Result           | File name in the breadcrumb                                    | `GET /api/files/{fileId}`                                                                        | covered (one extra request)                                                                         |
| Anomalies        | List, severity summary, exact numbers                          | `result.anomalies`, `result.severityCounts`                                                      | covered                                                                                             |
| Anomalies        | Severity / type / column filters                               | all anomalies are in the result                                                                  | **derived** in the browser                                                                          |
| Anomalies        | Affected rows drawer                                           | `rowIndexes` + `GET /api/files/{id}/rows?cursor=rowIndex-1&limit=1` per row                      | **derived**, one request per row, 10 at a time (gap 7)                                              |
| Charts           | Chart specs                                                    | `GET /api/analyses/{id}/charts`                                                                  | covered                                                                                             |
| Export           | Excel / PDF download                                           | `GET /api/analyses/{id}/export?format=`                                                          | covered                                                                                             |
| Users            | List, create, change role                                      | `GET/POST /api/users`, `PATCH /api/users/{id}/role`                                              | covered                                                                                             |
| Audit log        | Entries, filters by actor / action / date range                | `GET /api/audit-logs?actorId&action&from&to`                                                     | covered                                                                                             |
| Audit log        | Actor names, resource names                                    | ids only                                                                                         | **derived**: actor names from `GET /api/users`; resources stay ids (gap 10)                         |
| Webhooks         | List, create (secret shown once), delete                       | `GET/POST /api/webhooks`, `DELETE /api/webhooks/{id}`                                            | covered                                                                                             |
| Webhooks         | Active toggle                                                  | `isActive` is read-only                                                                          | **missing**, shown as text (gap 11)                                                                 |
| Webhooks         | Last delivery, delivery history                                | none                                                                                             | **missing**, column and drawer hidden (gap 11)                                                      |

## Gaps and proposed backend additions (most important first)

1. **Dashboard aggregates.** The dashboard needs counts across all visible files and a cross-file list of
   recent analyses. Today the client derives them from the first 100 files and the latest analysis of the 10
   newest READY files, and labels the numbers as approximate. _Proposal:_ `GET /api/dashboard` returning
   `{ filesUploaded30d, filesUploaded7d, analysesRun30d, analysesRun7d, anomalies30d, highSeverity30d,
processingNow, avgIngestSeconds }` with the same visibility rules as `GET /api/files`, and
   `GET /api/analyses?limit=` (newest first across visible files, with `fileName` and severity counts).
2. **File list search and filters.** No `q`, `status` or `ownerId` query parameters, and no sheet count in
   the list. The client filters only what is loaded ("Load more" fetches the next page unfiltered) and says
   so. _Proposal:_ `GET /api/files?q=&status=&ownerId=` (server-side, keyset compatible) and
   `sheetCount` on `File`.
3. **Owner display names.** `File.ownerId` has no name, and `GET /api/users` is admin-only, so managers see
   "You" or a short id. _Proposal:_ add `owner: { id, name }` to `File` and `FileDetail`.
4. **Upload limits are not exposed.** The design's placeholder limits (25 MB / 10 sheets / 500,000 rows) do
   not match the server defaults (20 MB / 20 sheets / 200,000 rows in `server/.env.example`). The client
   reads `VITE_UPLOAD_MAX_BYTES`, `VITE_UPLOAD_MAX_SHEETS`, `VITE_UPLOAD_MAX_ROWS` (defaults equal to the
   server defaults) for copy and the size pre-check; the server stays the authority. _Proposal:_
   `GET /api/config` (authenticated) with `{ upload: { maxBytes, maxSheets, maxRows, extensions } }`.
5. **Masked columns per sheet.** The schema table's "Masking" column needs to know which columns hold PII.
   The client infers it from tokens in the loaded preview rows, which can miss a column whose first rows are
   empty. _Proposal:_ `Column.pii: null | 'PERSON' | 'IBAN' | 'CARD' | 'PHONE' | 'EMAIL' | ...`.
6. **Login lockout details.** A wrong password returns only `401 Invalid email or password`; a locked account
   returns `429` without `Retry-After`. The design shows "2 attempts left" and a live "Try again in 14:32".
   The client shows the error without the attempt count, and the lockout banner without a countdown (it
   uses `Retry-After` when present, which covers the per-IP auth limiter). _Proposal:_ `details:
{ attemptsLeft }` on the 401 and `Retry-After` plus `details: { lockedUntil }` on the lockout 429.
   (Revealing attempts left is a product decision; it slightly helps an attacker.)
7. **Rows by index.** The affected-rows drawer needs specific rows. The client fetches each with
   `cursor=rowIndex-1&limit=1`, 10 at a time. _Proposal:_ `GET /api/files/{id}/rows?sheetId=&rowIndexes=1,5,9`
   (max 100) or `GET /api/analyses/{id}/anomalies/{anomalyId}/rows` with cursor pagination.
8. **Notifications.** No notification endpoint. The bell lists live socket events from the current session
   only (analysis completed / failed, file processed); it is empty after a reload. _Proposal:_
   `GET /api/notifications?cursor=` + `POST /api/notifications/read`, written by the worker.
9. **Risk severity.** `Summary.risks` are strings, so the "2 high" badge on the Risks header cannot be shown.
   _Proposal:_ `risks: { text, severity, anomalyIds }[]` (schema version bump).
10. **Audit resource names.** Audit entries carry `resourceType` + `resourceId`; the design shows file names.
    _Proposal:_ include `resourceLabel` (file name, user email, webhook URL) captured at write time.
11. **Webhook management.** No way to pause a webhook (`isActive` is read-only), and no delivery history
    endpoint, although deliveries are stored. _Proposal:_ `PATCH /api/webhooks/{id} { isActive }`,
    `GET /api/webhooks/{id}/deliveries?cursor=` (`event`, `status`, `attempts`, `lastError`, `createdAt`), and
    `lastDelivery` on `Webhook`.
12. **Refresh token transport.** The refresh token comes back in the JSON body, so the client keeps it in
    `sessionStorage` (readable by any script on the origin, which a strict CSP mitigates). _Proposal:_ set it
    as an `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/auth`, and accept it from the cookie in
    `refresh` and `logout`.
13. **Ingest detail in progress events.** `file:ingest:progress` has `percent` only; the design shows the
    current sheet and rows read. _Proposal:_ add `{ sheet, sheetIndex, sheetCount, rowsRead, rowsTotal }`.
