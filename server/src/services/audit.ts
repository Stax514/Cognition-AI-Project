import type { PoolClient } from 'pg';
import { query } from '../db.js';
import type { RefundStatus } from '../types.js';

export interface AuditEntry {
  actorUserId: number;
  action: string;
  refundId?: number | null;
  oldStatus?: RefundStatus | null;
  newStatus?: RefundStatus | null;
  comment?: string | null;
  ip?: string | null;
}

const INSERT_AUDIT = `
  INSERT INTO audit_log (actor_user_id, action, refund_id, old_status, new_status, comment, ip)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

/**
 * The only write path to audit_log. There is deliberately no update or delete
 * counterpart, and the database role used by the API cannot perform either.
 */
export async function recordAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const params = [
    entry.actorUserId,
    entry.action,
    entry.refundId ?? null,
    entry.oldStatus ?? null,
    entry.newStatus ?? null,
    entry.comment ?? null,
    entry.ip ?? null,
  ];
  if (client) {
    await client.query(INSERT_AUDIT, params);
    return;
  }
  await query(INSERT_AUDIT, params);
}
