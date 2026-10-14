import { z } from 'zod';

export const PaginationQuery = z.object({
  cursor: z
    .uuid()
    .optional()
    .meta({ description: 'Opaque cursor from `meta.nextCursor` of the previous page' }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const PageMeta = z.object({ nextCursor: z.string().nullable() });

/**
 * Cursor (keyset) pagination: stable under concurrent inserts and O(limit) at any depth,
 * unlike OFFSET. One extra row is fetched to know whether another page exists.
 */
export function pageArgs({ cursor, limit }: PaginationQuery) {
  return { take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
}

export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

// Newest first, with id as a tie-breaker so the order is total and the cursor is unambiguous.
export const newestFirst = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
