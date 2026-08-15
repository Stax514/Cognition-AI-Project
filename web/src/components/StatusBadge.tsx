import type { RefundStatus } from '../types';

export function StatusBadge({ status }: { status: RefundStatus }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}
