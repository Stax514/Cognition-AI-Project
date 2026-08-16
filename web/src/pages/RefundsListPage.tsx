import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { FiltersBar } from '../components/FiltersBar';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { CreateRefundDialog } from '../components/CreateRefundDialog';
import {
  EMPTY_FILTERS,
  formatDateTime,
  formatMoney,
  humanise,
  type Paginated,
  type Refund,
  type RefundFilters,
  type RefundReason,
  type RefundStatus,
  type User,
} from '../types';

/** Filters live in the URL so a filtered view can be shared or reloaded. */
function fromSearchParams(params: URLSearchParams): RefundFilters {
  return {
    ...EMPTY_FILTERS,
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? EMPTY_FILTERS.pageSize),
    dateFrom: params.get('dateFrom') ?? '',
    dateTo: params.get('dateTo') ?? '',
    amountMin: params.get('amountMin') ?? '',
    amountMax: params.get('amountMax') ?? '',
    reason: params.getAll('reason') as RefundReason[],
    status: params.getAll('status') as RefundStatus[],
    sort: (params.get('sort') as RefundFilters['sort']) ?? EMPTY_FILTERS.sort,
    order: (params.get('order') as RefundFilters['order']) ?? EMPTY_FILTERS.order,
  };
}

function toSearchParams(filters: RefundFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.amountMin) params.set('amountMin', filters.amountMin);
  if (filters.amountMax) params.set('amountMax', filters.amountMax);
  filters.reason.forEach((reason) => params.append('reason', reason));
  filters.status.forEach((status) => params.append('status', status));
  params.set('sort', filters.sort);
  params.set('order', filters.order);
  return params;
}

export function RefundsListPage({ user }: { user: User }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => fromSearchParams(searchParams), [searchParams]);
  const [data, setData] = useState<Paginated<Refund> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listRefunds(filters)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(load, [load]);

  function update(next: Partial<RefundFilters>) {
    setSearchParams(toSearchParams({ ...filters, ...next }));
  }

  const canCreate = user.role === 'agent' || user.role === 'approver';

  return (
    <>
      <div className="page-header">
        <h1>Refunds</h1>
        {canCreate && (
          <button type="button" className="button primary" onClick={() => setCreating(true)}>
            New refund
          </button>
        )}
      </div>

      <FiltersBar
        filters={filters}
        onChange={update}
        onReset={() => setSearchParams(toSearchParams(EMPTY_FILTERS))}
      />

      {error && <p className="error">{error}</p>}

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Created</th>
              <th>Customer</th>
              <th>Account</th>
              <th className="numeric">Amount</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Raised by</th>
              <th>Decided by</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((refund) => (
              <tr key={refund.id}>
                <td>
                  <Link to={`/refunds/${refund.id}`}>#{refund.id}</Link>
                </td>
                <td>{formatDateTime(refund.createdAt)}</td>
                <td>{refund.customer.name}</td>
                <td className="mono">{refund.customer.accountNumberMasked}</td>
                <td className="numeric">{formatMoney(refund.amountCents, refund.currency)}</td>
                <td>{humanise(refund.reason)}</td>
                <td>
                  <StatusBadge status={refund.status} />
                </td>
                <td>{refund.createdBy.name}</td>
                <td>{refund.decidedBy ? refund.decidedBy.name : <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!loading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No refunds match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {loading && <p className="loading">Loading…</p>}

        {data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={(page) => update({ page })}
            onPageSizeChange={(pageSize) => update({ pageSize, page: 1 })}
          />
        )}
      </section>

      {creating && (
        <CreateRefundDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </>
  );
}
