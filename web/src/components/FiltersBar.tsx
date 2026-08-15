import { REFUND_REASONS, REFUND_STATUSES, humanise } from '../types';
import type { RefundFilters, RefundReason, RefundStatus } from '../types';

interface Props {
  filters: RefundFilters;
  onChange: (next: Partial<RefundFilters>) => void;
  onReset: () => void;
}

/**
 * All filtering happens on the server; this component only collects the values
 * and pushes them into the query string.
 */
export function FiltersBar({ filters, onChange, onReset }: Props) {
  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <section className="card filters">
      <div className="filter-row">
        <label>
          Created from
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => onChange({ dateFrom: event.target.value, page: 1 })}
          />
        </label>
        <label>
          Created to
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => onChange({ dateTo: event.target.value, page: 1 })}
          />
        </label>
        <label>
          Min amount
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={filters.amountMin}
            onChange={(event) => onChange({ amountMin: event.target.value, page: 1 })}
          />
        </label>
        <label>
          Max amount
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={filters.amountMax}
            onChange={(event) => onChange({ amountMax: event.target.value, page: 1 })}
          />
        </label>
        <label>
          Sort by
          <select
            value={`${filters.sort}:${filters.order}`}
            onChange={(event) => {
              const [sort, order] = event.target.value.split(':') as [
                RefundFilters['sort'],
                RefundFilters['order'],
              ];
              onChange({ sort, order, page: 1 });
            }}
          >
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="amount_cents:desc">Amount, high to low</option>
            <option value="amount_cents:asc">Amount, low to high</option>
            <option value="status:asc">Status</option>
          </select>
        </label>
      </div>

      <div className="filter-row">
        <fieldset>
          <legend>Status</legend>
          {REFUND_STATUSES.map((status: RefundStatus) => (
            <label key={status} className="checkbox">
              <input
                type="checkbox"
                checked={filters.status.includes(status)}
                onChange={() => onChange({ status: toggle(filters.status, status), page: 1 })}
              />
              {humanise(status)}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Reason</legend>
          {REFUND_REASONS.map((reason: RefundReason) => (
            <label key={reason} className="checkbox">
              <input
                type="checkbox"
                checked={filters.reason.includes(reason)}
                onChange={() => onChange({ reason: toggle(filters.reason, reason), page: 1 })}
              />
              {humanise(reason)}
            </label>
          ))}
        </fieldset>

        <button type="button" className="button subtle" onClick={onReset}>
          Clear filters
        </button>
      </div>
    </section>
  );
}
