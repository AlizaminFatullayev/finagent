import { z } from 'zod';
import { PageMeta, PaginationQuery } from '../../lib/pagination.js';

export const FileStatusSchema = z
  .enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED'])
  .meta({ id: 'FileStatus' });

export const ColumnSchemaSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    type: z.enum(['number', 'currency', 'percent', 'date', 'boolean', 'id', 'text']),
    nullRatio: z.number(),
    distinctCount: z.number().int(),
  })
  .meta({ id: 'Column' });

export const SheetSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    position: z.number().int(),
    headerRow: z
      .number()
      .int()
      .meta({ description: '1-based worksheet row of the header; 0 if none was found' }),
    rowCount: z.number().int(),
    columns: z.array(ColumnSchemaSchema),
  })
  .meta({ id: 'Sheet' });

export const FileSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    originalName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    sha256: z.string(),
    status: FileStatusSchema,
    errorMessage: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'File' });

export const FileDetailSchema = FileSchema.extend({ sheets: z.array(SheetSchema) }).meta({
  id: 'FileDetail',
});

export const UploadMeta = z.object({
  deduplicated: z
    .boolean()
    .meta({ description: 'True when the same user already uploaded identical content' }),
});

export const UploadBody = z.object({
  file: z.string().meta({ format: 'binary', description: '.xlsx or .csv workbook' }),
});

export const FileIdParams = z.object({ id: z.uuid() });
export const ListFilesQuery = PaginationQuery;
export const FileListMeta = PageMeta;

export const RowsQuery = z.object({
  sheetId: z.uuid().optional().meta({ description: 'Defaults to the first sheet' }),
  cursor: z.coerce.number().int().min(0).optional().meta({ description: 'rowIndex from `meta.nextCursor`' }),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  unmask: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true')
    .meta({ description: 'Return original PII values (managers and admins only; audited as pii.unmask)' }),
});
export type RowsQuery = z.infer<typeof RowsQuery>;

export const RowSchema = z
  .object({ rowIndex: z.number().int(), data: z.record(z.string(), z.unknown()) })
  .meta({ id: 'Row' });
export const RowsMeta = z.object({
  sheetId: z.uuid(),
  nextCursor: z.number().int().nullable(),
  masked: z.boolean(),
});

// Same shape the masker emits, e.g. [PERSON_3]; anything else cannot be in the vault.
const MaskToken = z
  .string()
  .max(40)
  .regex(/^\[[A-Z]+_\d+\]$/, 'must be a mask token such as [PERSON_3]');

export const UnmaskBody = z.object({
  tokens: z
    .array(MaskToken)
    .min(1)
    .max(50)
    .transform((tokens) => [...new Set(tokens)])
    .meta({
      description: 'Tokens to reveal (1-50, duplicates ignored)',
      example: ['[PERSON_3]', '[IBAN_1]'],
    }),
  reason: z
    .string()
    .trim()
    .min(5)
    .max(200)
    .meta({ description: 'Why the original values are needed; stored in the audit log' }),
});
export type UnmaskBody = z.infer<typeof UnmaskBody>;

export const UnmaskResultSchema = z
  .object({
    values: z
      .record(z.string(), z.string())
      .meta({ description: 'token -> original value', example: { '[PERSON_3]': 'Aysel Mammadova' } }),
    notFound: z.array(z.string()).meta({ description: 'Requested tokens that this file does not contain' }),
  })
  .meta({ id: 'UnmaskResult' });

// Never expose storedName: it is an internal storage key.
export const fileSelect = {
  id: true,
  ownerId: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  status: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;
