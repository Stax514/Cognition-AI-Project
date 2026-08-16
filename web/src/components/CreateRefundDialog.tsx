import { useState } from 'react';
import { api, ApiError } from '../api';
import { REFUND_REASONS, humanise, type RefundReason } from '../types';

/**
 * Minimal intake form: a refund is raised against an existing transaction id.
 * A production version would search transactions instead of asking for the id.
 */
export function CreateRefundDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<RefundReason>('duplicate');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.createRefund({
        transactionId: Number(transactionId),
        amountCents: Math.round(Number(amount) * 100),
        reason,
        note: note.trim() || undefined,
      });
      onCreated();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create the refund.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="card modal" onSubmit={handleSubmit}>
        <h2>New refund</h2>
        <label>
          Transaction ID
          <input
            type="number"
            min="1"
            required
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
          />
        </label>
        <label>
          Amount
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label>
          Reason
          <select value={reason} onChange={(event) => setReason(event.target.value as RefundReason)}>
            {REFUND_REASONS.map((option) => (
              <option key={option} value={option}>
                {humanise(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note (optional)
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button subtle" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create refund'}
          </button>
        </div>
      </form>
    </div>
  );
}
