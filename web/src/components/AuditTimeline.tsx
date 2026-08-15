import { formatDateTime, humanise, type AuditEntry } from '../types';

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="empty">No audit entries yet.</p>;
  }

  return (
    <ol className="timeline">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div className="timeline-head">
            <strong>{humanise(entry.action.replace('refund.', ''))}</strong>
            <span className="muted">{formatDateTime(entry.createdAt)}</span>
          </div>
          <p className="muted">
            {entry.actor.name} ({entry.actor.role})
            {entry.oldStatus && entry.newStatus ? ` · ${entry.oldStatus} → ${entry.newStatus}` : ''}
          </p>
          {entry.comment && <p className="comment">“{entry.comment}”</p>}
        </li>
      ))}
    </ol>
  );
}
