import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { AuditTimeline } from '../components/AuditTimeline';
import { DecisionDialog } from '../components/DecisionDialog';
import { StatusBadge } from '../components/StatusBadge';
import {
  formatDateTime,
  formatMoney,
  humanise,
  type AuditEntry,
  type Paginated,
  type Refund,
  type Transaction,
  type User,
} from '../types';

export function RefundDetailPage({ user }: { user: User }) {
  const { id } = useParams();
  const refundId = Number(id);
  const [refund, setRefund] = useState<Refund | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [transactions, setTransactions] = useState<Paginated<Transaction> | null>(null);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    api
      .getRefund(refundId)
      .then((result) => {
        setRefund(result.refund);
        setAuditTrail(result.auditTrail);
      })
      .catch((cause: Error) => setError(cause.message));
    api
      .getTransactions(refundId, 1, 10)
      .then(setTransactions)
      .catch(() => setTransactions(null));
  }, [refundId]);

  if (error) return <p className="error">{error}</p>;
  if (!refund) return <p className="loading">Loading…</p>;

  // The server enforces both rules; the UI mirrors them so the reason a button
  // is unavailable is visible up front.
  const isOwnRefund = refund.createdBy.id === user.id;
  const canDecide = user.role === 'approver' && refund.status === 'pending' && !isOwnRefund;
  const blockedReason =
    user.role !== 'approver'
      ? 'Only approvers can decide refunds.'
      : refund.status !== 'pending'
        ? `This refund is already ${refund.status}.`
        : isOwnRefund
          ? 'Maker-checker: you raised this refund, so someone else must decide it.'
          : '';

  async function decide(comment: string) {
    if (!decision) return;
    const result = await api.decide(refundId, decision, comment);
    setRefund(result.refund);
    setAuditTrail(result.auditTrail);
    setDecision(null);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link to="/refunds" className="linkish">
            ← Back to refunds
          </Link>
          <h1>
            Refund #{refund.id} <StatusBadge status={refund.status} />
          </h1>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button primary"
            disabled={!canDecide}
            title={blockedReason}
            onClick={() => setDecision('approve')}
          >
            Approve
          </button>
          <button
            type="button"
            className="button danger"
            disabled={!canDecide}
            title={blockedReason}
            onClick={() => setDecision('reject')}
          >
            Reject
          </button>
        </div>
      </div>

      {blockedReason && <p className="notice">{blockedReason}</p>}

      <div className="detail-grid">
        <section className="card">
          <h2>Refund</h2>
          <dl className="definitions">
            <dt>Amount</dt>
            <dd>{formatMoney(refund.amountCents, refund.currency)}</dd>
            <dt>Reason</dt>
            <dd>{humanise(refund.reason)}</dd>
            <dt>Raised by</dt>
            <dd>{refund.createdBy.name}</dd>
            <dt>Raised at</dt>
            <dd>{formatDateTime(refund.createdAt)}</dd>
            <dt>Customer</dt>
            <dd>{refund.customer.name}</dd>
            <dt>Account</dt>
            <dd className="mono">{refund.customer.accountNumberMasked}</dd>
            {refund.note && (
              <>
                <dt>Note</dt>
                <dd>{refund.note}</dd>
              </>
            )}
            {refund.decidedBy && (
              <>
                <dt>Decided by</dt>
                <dd>
                  {refund.decidedBy.name}
                  {refund.decidedAt ? ` · ${formatDateTime(refund.decidedAt)}` : ''}
                </dd>
                <dt>Decision comment</dt>
                <dd>{refund.decisionComment}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="card">
          <h2>Audit timeline</h2>
          <AuditTimeline entries={auditTrail} />
        </section>

        <section className="card wide">
          <h2>Customer transaction history</h2>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Description</th>
                <th className="numeric">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions?.rows.map((transaction) => (
                <tr key={transaction.id}>
                  <td>#{transaction.id}</td>
                  <td>{formatDateTime(transaction.occurredAt)}</td>
                  <td>{transaction.description}</td>
                  <td className="numeric">
                    {formatMoney(transaction.amountCents, transaction.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions && (
            <p className="muted">
              Showing {transactions.rows.length} of {transactions.total} transactions.
            </p>
          )}
        </section>
      </div>

      {decision && (
        <DecisionDialog decision={decision} onCancel={() => setDecision(null)} onConfirm={decide} />
      )}
    </>
  );
}
