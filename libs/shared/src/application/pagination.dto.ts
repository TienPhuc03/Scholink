import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(Math.max(parseInt(val, 10), 1), 50) : 10)),
  cursor: z.string().optional(),
});

export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
  total?: number;
}

export class PaginationHelper {
  static encodeCursor(data: Record<string, any>): string {
    return Buffer.from(JSON.stringify(data)).toString('base64url');
  }

  static decodeCursor<T = Record<string, any>>(cursor?: string): T | null {
    if (!cursor) return null;
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
      return JSON.parse(decoded) as T;
    } catch {
      return null;
    }
  }

  static createPaginatedResponse<T>(items: T[], limit: number, getCursorPayload: (item: T) => Record<string, any>): PaginatedResult<T> {
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    let nextCursor: string | null = null;

    if (hasMore && resultItems.length > 0) {
      const lastItem = resultItems[resultItems.length - 1];
      nextCursor = PaginationHelper.encodeCursor(getCursorPayload(lastItem));
    }

    return {
      items: resultItems,
      nextCursor,
      hasMore,
    };
  }
}
