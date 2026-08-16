import { useState } from 'react';

/** Approving or rejecting always requires a comment for the audit trail. */
export function DecisionDialog({
  decision,
  onCancel,
  onConfirm,
}: {
  decision: 'approve' | 'reject';
  onCancel: () => void;
  onConfirm: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (comment.trim().length < 10) {
      setError('Please write at least 10 characters explaining the decision.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(comment.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The decision could not be recorded.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="card modal" onSubmit={handleSubmit}>
        <h2>{decision === 'approve' ? 'Approve refund' : 'Reject refund'}</h2>
        <label>
          Comment (required, recorded in the audit log)
          <textarea
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button subtle" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={decision === 'approve' ? 'button primary' : 'button danger'}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : `Confirm ${decision}`}
          </button>
        </div>
      </form>
    </div>
  );
}
