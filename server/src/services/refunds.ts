import { query, withTransaction } from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { recordAudit } from './audit.js';
import { SORTABLE_COLUMNS, type ListRefundsQuery } from '../validators.js';
import type { RefundReason, RefundStatus, SessionUser } from '../types.js';

export interface RefundRow {
  id: number;
  amount_cents: number;
  currency: string;
  reason: RefundReason;
  status: RefundStatus;
  note: string | null;
  created_at: Date;
  decided_at: Date | null;
  decision_comment: string | null;
  customer_id: number;
  customer_name: string;
  account_number_last4: string;
  created_by_id: number;
  created_by_name: string;
  decided_by_id: number | null;
  decided_by_name: string | null;
}

/** Account numbers are only ever stored and shown as the last four digits. */
export function maskAccountNumber(last4: string): string {
  return `••••${last4}`;
}

function toRefund(row: RefundRow) {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    reason: row.reason,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decisionComment: row.decision_comment,
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      accountNumberMasked: maskAccountNumber(row.account_number_last4),
    },
    createdBy: { id: row.created_by_id, name: row.created_by_name },
    decidedBy: row.decided_by_id ? { id: row.decided_by_id, name: row.decided_by_name } : null,
  };
}

export type Refund = ReturnType<typeof toRefund>;

const REFUND_SELECT = `
  SELECT r.id, r.amount_cents, r.currency, r.reason, r.status, r.note,
         r.created_at, r.decided_at, r.decision_comment,
         c.id AS customer_id, c.name AS customer_name, c.account_number_last4,
         creator.id AS created_by_id, creator.name AS created_by_name,
         decider.id AS decided_by_id, decider.name AS decided_by_name
    FROM refunds r
    JOIN customers c ON c.id = r.customer_id
    JOIN users creator ON creator.id = r.created_by
    LEFT JOIN users decider ON decider.id = r.decided_by
`;

/**
 * Builds the filter clause. Every user-supplied value becomes a bound
 * parameter; only the sort column comes from code, via a fixed whitelist.
 */
function buildFilters(q: ListRefundsQuery): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (q.dateFrom !== undefined) {
    params.push(q.dateFrom);
    clauses.push(`r.created_at >= $${params.length}::timestamptz`);
  }
  if (q.dateTo !== undefined) {
    params.push(q.dateTo);
    // Inclusive end date: `2024-05-01` covers all of 1 May.
    clauses.push(`r.created_at < ($${params.length}::timestamptz + interval '1 day')`);
  }
  if (q.amountMin !== undefined) {
    params.push(q.amountMin);
    clauses.push(`r.amount_cents >= $${params.length}`);
  }
  if (q.amountMax !== undefined) {
    params.push(q.amountMax);
    clauses.push(`r.amount_cents <= $${params.length}`);
  }
  if (q.reason && q.reason.length > 0) {
    params.push(q.reason);
    clauses.push(`r.reason = ANY($${params.length}::text[])`);
  }
  if (q.status && q.status.length > 0) {
    params.push(q.status);
    clauses.push(`r.status = ANY($${params.length}::text[])`);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listRefunds(q: ListRefundsQuery): Promise<{
  rows: Refund[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { where, params } = buildFilters(q);

  const countResult = await query<{ total: number }>(
    `SELECT count(*)::bigint AS total FROM refunds r ${where}`,
    params,
  );
  const total = countResult.rows[0]?.total ?? 0;

  const sortColumn = SORTABLE_COLUMNS[q.sort];
  const direction = q.order === 'asc' ? 'ASC' : 'DESC';
  const pageParams = [...params, q.pageSize, (q.page - 1) * q.pageSize];

  const rows = await query<RefundRow>(
    `${REFUND_SELECT} ${where}
      ORDER BY ${sortColumn} ${direction}, r.id ${direction}
      LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams,
  );

  return { rows: rows.rows.map(toRefund), total, page: q.page, pageSize: q.pageSize };
}

export async function getRefund(id: number): Promise<Refund> {
  const result = await query<RefundRow>(`${REFUND_SELECT} WHERE r.id = $1`, [id]);
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, 'Refund not found');
  }
  return toRefund(row);
}

export async function getRefundAuditTrail(refundId: number) {
  const result = await query<{
    id: number;
    action: string;
    old_status: RefundStatus | null;
    new_status: RefundStatus | null;
    comment: string | null;
    created_at: Date;
    actor_name: string;
    actor_role: string;
  }>(
    `SELECT a.id, a.action, a.old_status, a.new_status, a.comment, a.created_at,
            u.name AS actor_name, u.role AS actor_role
       FROM audit_log a
       JOIN users u ON u.id = a.actor_user_id
      WHERE a.refund_id = $1
      ORDER BY a.created_at ASC, a.id ASC`,
    [refundId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    comment: row.comment,
    createdAt: row.created_at,
    actor: { name: row.actor_name, role: row.actor_role },
  }));
}

export async function getCustomerTransactions(
  customerId: number,
  page: number,
  pageSize: number,
): Promise<{ rows: unknown[]; total: number; page: number; pageSize: number }> {
  const countResult = await query<{ total: number }>(
    'SELECT count(*)::bigint AS total FROM transactions WHERE customer_id = $1',
    [customerId],
  );
  const result = await query<{
    id: number;
    amount_cents: number;
    currency: string;
    description: string;
    occurred_at: Date;
  }>(
    `SELECT id, amount_cents, currency, description, occurred_at
       FROM transactions
      WHERE customer_id = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [customerId, pageSize, (page - 1) * pageSize],
  );
  return {
    rows: result.rows.map((row) => ({
      id: row.id,
      amountCents: row.amount_cents,
      currency: row.currency,
      description: row.description,
      occurredAt: row.occurred_at,
    })),
    total: countResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}

export interface CreateRefundInput {
  transactionId: number;
  amountCents: number;
  reason: RefundReason;
  note?: string;
}

// Arbitrary namespace so refund locks cannot collide with other advisory locks.
const REFUND_LOCK_NAMESPACE = 4711;

export async function createRefund(
  input: CreateRefundInput,
  actor: SessionUser,
  ip: string | null,
): Promise<Refund> {
  const id = await withTransaction(async (client) => {
    // Serialise concurrent refunds against the same payment so the total below
    // cannot be read stale. An advisory lock is used rather than SELECT FOR
    // UPDATE because the API role only holds SELECT on transactions.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [REFUND_LOCK_NAMESPACE, input.transactionId]);

    const transaction = await client.query<{ customer_id: number; amount_cents: number }>(
      'SELECT customer_id, amount_cents FROM transactions WHERE id = $1',
      [input.transactionId],
    );
    const row = transaction.rows[0];
    if (!row) {
      throw new HttpError(404, 'Transaction not found');
    }

    // Rejected refunds free their amount up again; pending and approved ones
    // still count against the original charge.
    const outstanding = await client.query<{ total: number }>(
      `SELECT coalesce(sum(amount_cents), 0)::bigint AS total
         FROM refunds
        WHERE transaction_id = $1 AND status <> 'rejected'`,
      [input.transactionId],
    );
    const alreadyRefunded = outstanding.rows[0]?.total ?? 0;
    if (alreadyRefunded + input.amountCents > row.amount_cents) {
      throw new HttpError(
        400,
        `Refund amount exceeds the amount still refundable on this transaction (${
          row.amount_cents - alreadyRefunded
        } cents)`,
      );
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO refunds (customer_id, transaction_id, amount_cents, reason, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [row.customer_id, input.transactionId, input.amountCents, input.reason, input.note ?? null, actor.id],
    );
    const refundId = inserted.rows[0]!.id;

    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'refund.created',
        refundId,
        oldStatus: null,
        newStatus: 'pending',
        comment: input.note ?? null,
        ip,
      },
      client,
    );
    return refundId;
  });

  return getRefund(id);
}

/**
 * Approves or rejects a pending refund. Maker-checker is enforced here (and
 * again by the `created_by <> $2` predicate in the UPDATE) so an approver can
 * never decide a refund they raised themselves.
 */
export async function decideRefund(
  refundId: number,
  decision: 'approved' | 'rejected',
  comment: string,
  actor: SessionUser,
  ip: string | null,
): Promise<Refund> {
  await withTransaction(async (client) => {
    const locked = await client.query<{ status: RefundStatus; created_by: number }>(
      'SELECT status, created_by FROM refunds WHERE id = $1 FOR UPDATE',
      [refundId],
    );
    const refund = locked.rows[0];
    if (!refund) {
      throw new HttpError(404, 'Refund not found');
    }
    if (refund.created_by === actor.id) {
      throw new HttpError(403, 'You cannot decide a refund you created');
    }
    if (refund.status !== 'pending') {
      throw new HttpError(409, `Refund is already ${refund.status}`);
    }

    const updated = await client.query(
      `UPDATE refunds
          SET status = $1, decided_by = $2, decided_at = now(), decision_comment = $3
        WHERE id = $4 AND status = 'pending' AND created_by <> $2`,
      [decision, actor.id, comment, refundId],
    );
    if (updated.rowCount !== 1) {
      throw new HttpError(409, 'Refund could not be updated');
    }

    await recordAudit(
      {
        actorUserId: actor.id,
        action: decision === 'approved' ? 'refund.approved' : 'refund.rejected',
        refundId,
        oldStatus: 'pending',
        newStatus: decision,
        comment,
        ip,
      },
      client,
    );
  });

  return getRefund(refundId);
}
