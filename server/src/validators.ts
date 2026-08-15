import { z } from 'zod';
import { REFUND_REASONS, REFUND_STATUSES } from './types.js';

/** Accepts `?status=pending&status=approved` and `?status=pending`. */
function multi<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess((value) => {
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value : [value];
  }, z.array(item).max(10).optional());
}

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD or an ISO timestamp'));

const cents = z.coerce.number().int().min(0).max(100_000_000);

export const SORTABLE_COLUMNS = {
  created_at: 'r.created_at',
  amount_cents: 'r.amount_cents',
  status: 'r.status',
} as const;

export const listRefundsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    amountMin: cents.optional(),
    amountMax: cents.optional(),
    reason: multi(z.enum(REFUND_REASONS)),
    status: multi(z.enum(REFUND_STATUSES)),
    sort: z.enum(['created_at', 'amount_cents', 'status']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((q) => q.amountMin === undefined || q.amountMax === undefined || q.amountMin <= q.amountMax, {
    message: 'amountMin must be less than or equal to amountMax',
    path: ['amountMin'],
  })
  .refine(
    (q) => q.dateFrom === undefined || q.dateTo === undefined || Date.parse(q.dateFrom) <= Date.parse(q.dateTo),
    { message: 'dateFrom must be on or before dateTo', path: ['dateFrom'] },
  );

export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().min(1),
});

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(200),
  })
  .strict();

export const decisionSchema = z
  .object({
    comment: z.string().trim().min(10, 'A comment of at least 10 characters is required').max(1000),
  })
  .strict();

export const createRefundSchema = z
  .object({
    transactionId: z.coerce.number().int().min(1),
    amountCents: z.coerce.number().int().min(1).max(100_000_000),
    reason: z.enum(REFUND_REASONS),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
