export type Role = 'viewer' | 'agent' | 'approver';

export const REFUND_REASONS = [
  'duplicate',
  'fraud',
  'customer_request',
  'processing_error',
  'subscription_cancellation',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface Refund {
  id: number;
  amountCents: number;
  currency: string;
  reason: RefundReason;
  status: RefundStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionComment: string | null;
  customer: { id: number; name: string; accountNumberMasked: string };
  createdBy: { id: number; name: string };
  decidedBy: { id: number; name: string } | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  oldStatus: RefundStatus | null;
  newStatus: RefundStatus | null;
  comment: string | null;
  createdAt: string;
  actor: { name: string; role: string };
}

export interface Transaction {
  id: number;
  amountCents: number;
  currency: string;
  description: string;
  occurredAt: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RefundFilters {
  page: number;
  pageSize: number;
  dateFrom: string;
  dateTo: string;
  /** Major units (dollars) as typed by the user; converted to cents on send. */
  amountMin: string;
  amountMax: string;
  reason: RefundReason[];
  status: RefundStatus[];
  sort: 'created_at' | 'amount_cents' | 'status';
  order: 'asc' | 'desc';
}

export const EMPTY_FILTERS: RefundFilters = {
  page: 1,
  pageSize: 25,
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  reason: [],
  status: [],
  sort: 'created_at',
  order: 'desc',
};

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function humanise(value: string): string {
  return value.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
