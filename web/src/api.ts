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

// Kept in memory only: the server hands it back on login and on /auth/me, so a
// reload recovers it and no other origin can read it.
let csrfToken = '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.method && init.method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...headers, ...init.headers },
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

async function authenticate(path: string, init?: RequestInit): Promise<{ user: User }> {
  const body = await request<{ user: User; csrfToken: string }>(path, init);
  csrfToken = body.csrfToken;
  return { user: body.user };
}

export const api = {
  me: () => authenticate('/auth/me'),
  login: (email: string, password: string) =>
    authenticate('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: async () => {
    await request<void>('/auth/logout', { method: 'POST' });
    csrfToken = '';
  },

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
