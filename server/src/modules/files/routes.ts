import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { bearer, envelope, errors, json, registry } from '../../lib/openapi.js';
import { authenticate } from '../../middleware/auth.js';
import { unmaskLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  FileDetailSchema,
  FileIdParams,
  FileListMeta,
  FileSchema,
  ListFilesQuery,
  RowSchema,
  RowsMeta,
  RowsQuery,
  UnmaskBody,
  UnmaskResultSchema,
  UploadBody,
  UploadMeta,
} from './schemas.js';

export const filesRouter = Router();
filesRouter.use(authenticate);

// Memory storage is safe because the size cap is enforced while streaming the upload;
// the bytes are needed in memory anyway for magic-byte, zip and hash checks.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fields: 5 },
  // Browsers send UTF-8 filenames; the latin1 default would garble Azerbaijani letters.
  defParamCharset: 'utf8',
});

registry.registerPath({
  method: 'post',
  path: '/api/files',
  tags: ['Files'],
  summary: 'Upload an .xlsx or .csv workbook',
  description:
    'Content is verified by magic bytes and zip structure, not by extension. Re-uploading identical bytes returns the existing file with `meta.deduplicated: true` (200). New files are queued for parsing (202); watch `file:ingest:progress` on the socket or poll GET /api/files/{id}.',
  security: bearer,
  request: { body: { content: { 'multipart/form-data': { schema: UploadBody } } } },
  responses: {
    200: json(envelope(FileSchema, UploadMeta), 'Identical file already uploaded by this user'),
    202: json(envelope(FileSchema, UploadMeta), 'Accepted for ingest'),
    ...errors(400, 401, 413, 422, 429),
  },
});
filesRouter.post('/', upload.single('file'), controller.upload);

registry.registerPath({
  method: 'get',
  path: '/api/files',
  tags: ['Files'],
  summary: 'List visible files, newest first (analysts see their own; managers and admins see all)',
  security: bearer,
  request: { query: ListFilesQuery },
  responses: { 200: json(envelope(z.array(FileSchema), FileListMeta)), ...errors(401, 422) },
});
filesRouter.get('/', validate({ query: ListFilesQuery }), controller.list);

registry.registerPath({
  method: 'get',
  path: '/api/files/{id}',
  tags: ['Files'],
  summary: 'File with its sheets and inferred column schema',
  security: bearer,
  request: { params: FileIdParams },
  responses: { 200: json(envelope(FileDetailSchema)), ...errors(401, 404, 422) },
});
filesRouter.get('/:id', validate({ params: FileIdParams }), controller.get);

registry.registerPath({
  method: 'get',
  path: '/api/files/{id}/rows',
  tags: ['Files'],
  summary: 'Page through the rows of a sheet (PII always masked)',
  description:
    'PII is replaced by tokens such as `[PERSON_3]`. Reveal specific tokens with POST /api/files/{id}/unmask. The former `unmask` query parameter returns 410.',
  security: bearer,
  request: { params: FileIdParams, query: RowsQuery },
  responses: { 200: json(envelope(z.array(RowSchema), RowsMeta)), ...errors(401, 404, 410, 422) },
});
filesRouter.get(
  '/:id/rows',
  // The old reveal flag is refused loudly, so a client cannot mistake masked rows for revealed ones.
  (req, _res, next) =>
    next(
      'unmask' in req.query
        ? new AppError(410, 'GONE', '`unmask` was removed; reveal tokens with POST /api/files/{id}/unmask')
        : undefined,
    ),
  validate({ params: FileIdParams, query: RowsQuery }),
  controller.rows,
);

registry.registerPath({
  method: 'post',
  path: '/api/files/{id}/unmask',
  tags: ['Files'],
  summary: 'Reveal the original values behind masked PII tokens',
  description:
    'The only way to see raw PII. Rows, anomalies, summaries and charts carry tokens such as `[PERSON_3]`; send the ones to reveal with a justification. ' +
    'Same file visibility as GET /api/files/{id} (analysts: own files), further limited to the roles in `UNMASK_ALLOWED_ROLES`. ' +
    'Audited as pii.unmask with the reason, token count and token types (never the values); rate limited per user; responses are `Cache-Control: no-store`.',
  security: bearer,
  request: {
    params: FileIdParams,
    body: { content: { 'application/json': { schema: UnmaskBody } } },
  },
  responses: { 200: json(envelope(UnmaskResultSchema)), ...errors(401, 403, 404, 422, 429) },
});
filesRouter.post(
  '/:id/unmask',
  unmaskLimiter,
  validate({ params: FileIdParams, body: UnmaskBody }),
  controller.unmask,
);

registry.registerPath({
  method: 'delete',
  path: '/api/files/{id}',
  tags: ['Files'],
  summary: 'Soft-delete a file (owner or admin)',
  security: bearer,
  request: { params: FileIdParams },
  responses: { 200: json(envelope(z.object({ deleted: z.literal(true) }))), ...errors(401, 403, 404, 422) },
});
filesRouter.delete('/:id', validate({ params: FileIdParams }), controller.remove);
