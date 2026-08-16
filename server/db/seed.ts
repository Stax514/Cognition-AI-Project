/**
 * Seeds three users (one per role), 40 customers, ~600 transactions and 200
 * refunds spread across statuses, reasons and the last 12 months.
 *
 * The generator is seeded with a fixed value, so repeated runs produce the same
 * data set. Running the script replaces any existing data.
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { config } from '../src/config.js';
import { REFUND_REASONS, type RefundReason, type RefundStatus } from '../src/types.js';

/** Small deterministic PRNG (mulberry32) so seeds are reproducible. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20240816);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const FIRST_NAMES = ['Ada', 'Miguel', 'Priya', 'Noah', 'Fatima', 'Chen', 'Olivia', 'Ibrahim', 'Sofia', 'Jonas'];
const LAST_NAMES = ['Byrne', 'Okafor', 'Nakamura', 'Silva', 'Haddad', 'Novak', 'Andersen', 'Rossi', 'Dubois', 'Kaur'];
const MERCHANTS = [
  'Monthly subscription',
  'Annual plan renewal',
  'Hardware purchase',
  'Marketplace order',
  'Add-on seats',
  'Support package',
  'Overage charge',
  'One-off setup fee',
];

const STATUS_MIX: RefundStatus[] = [
  ...Array<RefundStatus>(70).fill('pending'),
  ...Array<RefundStatus>(85).fill('approved'),
  ...Array<RefundStatus>(45).fill('rejected'),
];

const APPROVAL_COMMENTS = [
  'Duplicate charge confirmed against the original transaction. Approved.',
  'Customer evidence checked and the refund is within policy. Approved.',
  'Processing error verified with the payments team. Approved.',
  'Chargeback risk outweighs the amount. Approving the refund.',
];

const REJECTION_COMMENTS = [
  'Outside the 60 day refund window, so this cannot be approved.',
  'Service was delivered and used; no policy grounds for a refund.',
  'Insufficient evidence supplied by the customer. Rejecting for now.',
  'Duplicate request; the original refund was already processed.',
];

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: config.adminDatabaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    // Truncate as the schema owner. The API role cannot do this.
    await client.query('TRUNCATE audit_log, refunds, transactions, customers, users RESTART IDENTITY CASCADE');

    const passwordHash = await bcrypt.hash(config.seedPassword, 10);
    const users = await client.query<{ id: number; role: string }>(
      `INSERT INTO users (email, name, role, password_hash)
       VALUES ($1, 'Val Viewer', 'viewer', $4),
              ($2, 'Ari Agent', 'agent', $4),
              ($3, 'Ale Approver', 'approver', $4)
       RETURNING id, role`,
      ['viewer@example.com', 'agent@example.com', 'approver@example.com', passwordHash],
    );
    const agentId = users.rows.find((u) => u.role === 'agent')!.id;
    const approverId = users.rows.find((u) => u.role === 'approver')!.id;

    const customerIds: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example.com`;
      const result = await client.query<{ id: number }>(
        `INSERT INTO customers (name, email, account_number_last4)
         VALUES ($1, $2, $3) RETURNING id`,
        [name, email, String(randomInt(1000, 9999))],
      );
      customerIds.push(result.rows[0]!.id);
    }

    const transactionsByCustomer = new Map<number, { id: number; amountCents: number; occurredAt: Date }[]>();
    for (const customerId of customerIds) {
      const list: { id: number; amountCents: number; occurredAt: Date }[] = [];
      for (let i = 0; i < randomInt(10, 20); i += 1) {
        const amountCents = randomInt(500, 250_000);
        const occurredAt = daysAgo(randomInt(1, 400));
        const result = await client.query<{ id: number }>(
          `INSERT INTO transactions (customer_id, amount_cents, description, occurred_at)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [customerId, amountCents, pick(MERCHANTS), occurredAt],
        );
        list.push({ id: result.rows[0]!.id, amountCents, occurredAt });
      }
      transactionsByCustomer.set(customerId, list);
    }

    // Refunds never sum to more than the transaction they belong to, the same
    // invariant the API enforces when a refund is raised.
    const refundable = new Map<number, number>();

    for (const status of STATUS_MIX) {
      const customerId = pick(customerIds);
      const candidates = transactionsByCustomer.get(customerId)!;
      let transaction = pick(candidates);
      let remaining = refundable.get(transaction.id) ?? transaction.amountCents;
      for (let attempt = 0; remaining < 100 && attempt < 10; attempt += 1) {
        transaction = pick(candidates);
        remaining = refundable.get(transaction.id) ?? transaction.amountCents;
      }
      if (remaining < 100) continue;

      const reason: RefundReason = pick(REFUND_REASONS);
      const amountCents = random() < 0.3 ? remaining : Math.max(100, Math.round(remaining * random()));
      refundable.set(transaction.id, remaining - amountCents);
      const createdAt = daysAgo(randomInt(0, 360));
      // A slice of the pending queue is raised by the approver, so the
      // maker-checker rule is visible in the UI without creating data first.
      const createdBy = status === 'pending' && random() < 0.15 ? approverId : agentId;
      const decided = status !== 'pending';
      const decidedAt = decided ? new Date(createdAt.getTime() + randomInt(1, 72) * 3600 * 1000) : null;
      const comment = decided ? pick(status === 'approved' ? APPROVAL_COMMENTS : REJECTION_COMMENTS) : null;

      const refund = await client.query<{ id: number }>(
        `INSERT INTO refunds (customer_id, transaction_id, amount_cents, reason, status, note,
                              created_by, created_at, decided_by, decided_at, decision_comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          customerId,
          transaction.id,
          amountCents,
          reason,
          status,
          `Customer contacted support about: ${reason.replace(/_/g, ' ')}.`,
          createdBy,
          createdAt,
          decided ? approverId : null,
          decidedAt,
          comment,
        ],
      );
      const refundId = refund.rows[0]!.id;

      await client.query(
        `INSERT INTO audit_log (actor_user_id, action, refund_id, old_status, new_status, comment, ip, created_at)
         VALUES ($1, 'refund.created', $2, NULL, 'pending', $3, '127.0.0.1', $4)`,
        [createdBy, refundId, 'Raised from the support queue.', createdAt],
      );
      if (decided) {
        await client.query(
          `INSERT INTO audit_log (actor_user_id, action, refund_id, old_status, new_status, comment, ip, created_at)
           VALUES ($1, $2, $3, 'pending', $4, $5, '127.0.0.1', $6)`,
          [approverId, `refund.${status}`, refundId, status, comment, decidedAt],
        );
      }
    }

    await client.query('COMMIT');
    const seeded = await client.query<{ count: number }>('SELECT count(*)::bigint AS count FROM refunds');
    console.log(
      `Seeded ${customerIds.length} customers and ${seeded.rows[0]!.count} refunds. ` +
        `Log in as viewer@example.com / agent@example.com / approver@example.com with the seed password.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
