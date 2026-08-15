import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { config } from '../src/config.js';

const app = createApp();

async function login(email: string): Promise<TestAgent> {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/login')
    .send({ email, password: config.seedPassword });
  expect(response.status).toBe(200);
  return agent;
}

afterAll(async () => {
  await pool.end();
});

describe('authentication', () => {
  it('rejects unknown users and wrong passwords', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123!' })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'viewer@example.com', password: 'wrong' })
      .expect(401);
  });

  it('rejects malformed credentials before touching the database', async () => {
    await request(app).post('/api/auth/login').send({ email: 'not-an-email' }).expect(400);
  });

  it('requires a session for every /api route', async () => {
    await request(app).get('/api/refunds').expect(401);
    await request(app).get('/api/refunds/1').expect(401);
    await request(app).post('/api/refunds/1/approve').send({ comment: 'x'.repeat(20) }).expect(401);
  });
});

describe('role enforcement', () => {
  it('lets every role read refunds', async () => {
    for (const email of ['viewer@example.com', 'agent@example.com', 'approver@example.com']) {
      const agent = await login(email);
      await agent.get('/api/refunds').expect(200);
    }
  });

  it('blocks viewers from creating or deciding refunds', async () => {
    const viewer = await login('viewer@example.com');
    await viewer
      .post('/api/refunds')
      .send({ transactionId: 1, amountCents: 100, reason: 'duplicate' })
      .expect(403);
    const pending = await firstPendingRefundId();
    await viewer
      .post(`/api/refunds/${pending}/approve`)
      .send({ comment: 'Looks fine to me, approving.' })
      .expect(403);
  });

  it('blocks agents from deciding refunds', async () => {
    const agent = await login('agent@example.com');
    const pending = await firstPendingRefundId();
    await agent
      .post(`/api/refunds/${pending}/reject`)
      .send({ comment: 'Rejecting this refund request.' })
      .expect(403);
  });
});

describe('list filtering and pagination', () => {
  it('paginates server-side', async () => {
    const viewer = await login('viewer@example.com');
    const first = await viewer.get('/api/refunds?page=1&pageSize=5').expect(200);
    const second = await viewer.get('/api/refunds?page=2&pageSize=5').expect(200);
    expect(first.body.rows).toHaveLength(5);
    expect(first.body.total).toBeGreaterThan(100);
    expect(first.body.rows[0].id).not.toBe(second.body.rows[0].id);
  });

  it('applies status, reason and amount filters', async () => {
    const viewer = await login('viewer@example.com');
    const response = await viewer
      .get('/api/refunds?status=approved&reason=fraud&amountMin=1000&amountMax=50000&pageSize=100')
      .expect(200);
    for (const row of response.body.rows) {
      expect(row.status).toBe('approved');
      expect(row.reason).toBe('fraud');
      expect(row.amountCents).toBeGreaterThanOrEqual(1000);
      expect(row.amountCents).toBeLessThanOrEqual(50000);
    }
  });

  it('applies the date range filter', async () => {
    const viewer = await login('viewer@example.com');
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const response = await viewer.get(`/api/refunds?dateFrom=${from}&pageSize=100`).expect(200);
    for (const row of response.body.rows) {
      expect(new Date(row.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(from).getTime());
    }
  });

  it('rejects invalid filter values instead of ignoring them', async () => {
    const viewer = await login('viewer@example.com');
    await viewer.get('/api/refunds?status=deleted').expect(400);
    await viewer.get('/api/refunds?pageSize=5000').expect(400);
    await viewer.get('/api/refunds?amountMin=50&amountMax=10').expect(400);
    await viewer.get('/api/refunds?sort=amount_cents;DROP TABLE refunds').expect(400);
  });

  it('does not expose full account numbers', async () => {
    const viewer = await login('viewer@example.com');
    const response = await viewer.get('/api/refunds?pageSize=10').expect(200);
    for (const row of response.body.rows) {
      expect(row.customer.accountNumberMasked).toMatch(/^••••\d{4}$/);
      expect(JSON.stringify(row.customer)).not.toMatch(/\d{5,}/);
    }
  });
});

describe('refund detail', () => {
  it('returns the refund, masked customer and audit timeline', async () => {
    const viewer = await login('viewer@example.com');
    const id = await firstPendingRefundId();
    const response = await viewer.get(`/api/refunds/${id}`).expect(200);
    expect(response.body.refund.id).toBe(id);
    expect(response.body.auditTrail.length).toBeGreaterThanOrEqual(1);
    expect(response.body.auditTrail[0].action).toBe('refund.created');
  });

  it('returns the customer transaction history', async () => {
    const viewer = await login('viewer@example.com');
    const id = await firstPendingRefundId();
    const response = await viewer.get(`/api/refunds/${id}/transactions?pageSize=5`).expect(200);
    expect(response.body.rows.length).toBeGreaterThan(0);
    expect(response.body.total).toBeGreaterThan(0);
  });

  it('404s for a missing refund and 400s for a non-numeric id', async () => {
    const viewer = await login('viewer@example.com');
    await viewer.get('/api/refunds/999999').expect(404);
    await viewer.get('/api/refunds/abc').expect(400);
  });
});

describe('approve and reject', () => {
  it('requires a substantive comment', async () => {
    const approver = await login('approver@example.com');
    const id = await pendingRefundCreatedByAgent();
    await approver.post(`/api/refunds/${id}/approve`).send({ comment: 'ok' }).expect(400);
    await approver.post(`/api/refunds/${id}/approve`).send({}).expect(400);
  });

  it('approves a pending refund and appends an audit entry', async () => {
    const approver = await login('approver@example.com');
    const id = await pendingRefundCreatedByAgent();
    const before = await auditCount(id);
    const response = await approver
      .post(`/api/refunds/${id}/approve`)
      .send({ comment: 'Duplicate confirmed against the original charge.' })
      .expect(200);

    expect(response.body.refund.status).toBe('approved');
    expect(response.body.refund.decidedBy.name).toBe('Ale Approver');
    expect(await auditCount(id)).toBe(before + 1);

    const entry = response.body.auditTrail.at(-1);
    expect(entry.action).toBe('refund.approved');
    expect(entry.oldStatus).toBe('pending');
    expect(entry.newStatus).toBe('approved');
  });

  it('rejects a pending refund', async () => {
    const approver = await login('approver@example.com');
    const id = await pendingRefundCreatedByAgent();
    const response = await approver
      .post(`/api/refunds/${id}/reject`)
      .send({ comment: 'Outside the refund window, rejecting.' })
      .expect(200);
    expect(response.body.refund.status).toBe('rejected');
  });

  it('refuses to decide an already decided refund', async () => {
    const approver = await login('approver@example.com');
    const id = await pendingRefundCreatedByAgent();
    await approver
      .post(`/api/refunds/${id}/approve`)
      .send({ comment: 'Approving this refund request.' })
      .expect(200);
    await approver
      .post(`/api/refunds/${id}/reject`)
      .send({ comment: 'Changed my mind about this one.' })
      .expect(409);
  });

  it('enforces maker-checker: an approver cannot decide their own refund', async () => {
    const approver = await login('approver@example.com');
    const created = await approver
      .post('/api/refunds')
      .send({ transactionId: 1, amountCents: 100, reason: 'duplicate', note: 'Raised by approver' })
      .expect(201);
    const id = created.body.refund.id;

    await approver
      .post(`/api/refunds/${id}/approve`)
      .send({ comment: 'Trying to approve my own refund.' })
      .expect(403);

    const refund = await query<{ status: string }>('SELECT status FROM refunds WHERE id = $1', [id]);
    expect(refund.rows[0]?.status).toBe('pending');
  });
});

describe('refund creation', () => {
  it('validates the amount against the transaction', async () => {
    const agent = await login('agent@example.com');
    await agent
      .post('/api/refunds')
      .send({ transactionId: 1, amountCents: 999_999_99, reason: 'duplicate' })
      .expect(400);
    await agent
      .post('/api/refunds')
      .send({ transactionId: 999_999, amountCents: 100, reason: 'duplicate' })
      .expect(404);
    await agent
      .post('/api/refunds')
      .send({ transactionId: 1, amountCents: 100, reason: 'not_a_reason' })
      .expect(400);
  });

  it('refuses to refund more than the transaction has left', async () => {
    const agent = await login('agent@example.com');
    const candidate = await query<{ id: number; remaining: number }>(
      `SELECT t.id,
              t.amount_cents - coalesce(
                (SELECT sum(r.amount_cents) FROM refunds r
                  WHERE r.transaction_id = t.id AND r.status <> 'rejected'), 0)::bigint AS remaining
         FROM transactions t
        ORDER BY remaining DESC
        LIMIT 1`,
    );
    const { id, remaining } = candidate.rows[0]!;
    expect(remaining).toBeGreaterThan(100);

    await agent
      .post('/api/refunds')
      .send({ transactionId: id, amountCents: remaining, reason: 'duplicate' })
      .expect(201);
    await agent
      .post('/api/refunds')
      .send({ transactionId: id, amountCents: 100, reason: 'duplicate' })
      .expect(400);
  });

  it('records a creation entry in the audit log', async () => {
    const agent = await login('agent@example.com');
    const created = await agent
      .post('/api/refunds')
      .send({ transactionId: 1, amountCents: 100, reason: 'processing_error' })
      .expect(201);
    const trail = await query<{ action: string }>(
      'SELECT action FROM audit_log WHERE refund_id = $1',
      [created.body.refund.id],
    );
    expect(trail.rows.map((row) => row.action)).toEqual(['refund.created']);
  });
});

describe('audit_log is append-only', () => {
  it('refuses updates and deletes for the application database role', async () => {
    await expect(query('UPDATE audit_log SET comment = $1 WHERE id = 1', ['tampered'])).rejects.toThrow();
    await expect(query('DELETE FROM audit_log WHERE id = 1')).rejects.toThrow();
  });
});

async function firstPendingRefundId(): Promise<number> {
  const result = await query<{ id: number }>(
    "SELECT id FROM refunds WHERE status = 'pending' ORDER BY id LIMIT 1",
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('No pending refunds in the seed data');
  return id;
}

/** A pending refund the approver did not create, so it can legitimately be decided. */
async function pendingRefundCreatedByAgent(): Promise<number> {
  const result = await query<{ id: number }>(
    `SELECT r.id FROM refunds r
       JOIN users u ON u.id = r.created_by
      WHERE r.status = 'pending' AND u.role = 'agent'
      ORDER BY r.id LIMIT 1`,
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('No agent-created pending refunds in the seed data');
  return id;
}

async function auditCount(refundId: number): Promise<number> {
  const result = await query<{ count: number }>(
    'SELECT count(*)::bigint AS count FROM audit_log WHERE refund_id = $1',
    [refundId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
