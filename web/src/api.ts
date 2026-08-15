import type {
  AuditEntry,
  Paginated,
  Refund,
  RefundFilters,
  Transaction,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body.error ?? 'Request failed', body.details);
  }
  return body as T;
}

export function buildRefundQuery(filters: RefundFilters): string {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.amountMin) params.set('amountMin', String(Math.round(Number(filters.amountMin) * 100)));
  if (filters.amountMax) params.set('amountMax', String(Math.round(Number(filters.amountMax) * 100)));
  for (const reason of filters.reason) params.append('reason', reason);
  for (const status of filters.status) params.append('status', status);
  params.set('sort', filters.sort);
  params.set('order', filters.order);
  return params.toString();
}

export const api = {
  me: () => request<{ user: User }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  listRefunds: (filters: RefundFilters) =>
    request<Paginated<Refund>>(`/refunds?${buildRefundQuery(filters)}`),
  getRefund: (id: number) => request<{ refund: Refund; auditTrail: AuditEntry[] }>(`/refunds/${id}`),
  getTransactions: (id: number, page = 1, pageSize = 10) =>
    request<Paginated<Transaction>>(`/refunds/${id}/transactions?page=${page}&pageSize=${pageSize}`),
  decide: (id: number, decision: 'approve' | 'reject', comment: string) =>
    request<{ refund: Refund; auditTrail: AuditEntry[] }>(`/refunds/${id}/${decision}`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  createRefund: (input: { transactionId: number; amountCents: number; reason: string; note?: string }) =>
    request<{ refund: Refund }>('/refunds', { method: 'POST', body: JSON.stringify(input) }),
};
