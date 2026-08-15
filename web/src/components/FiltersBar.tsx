import { useEffect, useState } from 'react';
import { REFUND_REASONS, REFUND_STATUSES, humanise } from '../types';
import type { RefundFilters, RefundReason, RefundStatus } from '../types';

interface Props {
  filters: RefundFilters;
  onChange: (next: Partial<RefundFilters>) => void;
  onReset: () => void;
}

// Typing into a native date input can produce years like 275760, which the API
// rejects with a generic error. Bound the field and check it here instead.
const MIN_DATE = '2000-01-01';
const MAX_DATE = new Date().toISOString().slice(0, 10);

function dateError(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    return 'Enter a date as YYYY-MM-DD.';
  }
  if (value < MIN_DATE || value > MAX_DATE) {
    return `Enter a date between ${MIN_DATE} and ${MAX_DATE}.`;
  }
  return null;
}

/**
 * All filtering happens on the server; this component only collects the values
 * and pushes them into the query string.
 */
export function FiltersBar({ filters, onChange, onReset }: Props) {
  // The raw text is held locally so a half-typed date can stay on screen
  // without being sent to the server.
  const [dates, setDates] = useState({ from: filters.dateFrom, to: filters.dateTo });
  const [errors, setErrors] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });

  useEffect(() => {
    setDates({ from: filters.dateFrom, to: filters.dateTo });
    setErrors({ from: null, to: null });
  }, [filters.dateFrom, filters.dateTo]);

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function errorFor(field: 'from' | 'to', value: string): string | null {
    const own = dateError(value);
    if (own) return own;
    const other = field === 'from' ? dates.to : dates.from;
    if (!value || !other || dateError(other)) return null;
    const outOfOrder = field === 'from' ? value > other : value < other;
    return outOfOrder ? 'The start date must be on or before the end date.' : null;
  }

  const datesDirty = dates.from !== filters.dateFrom || dates.to !== filters.dateTo;
  const datesValid = !errors.from && !errors.to;

  function applyDates() {
    if (!datesDirty || !datesValid) return;
    onChange({ dateFrom: dates.from, dateTo: dates.to, page: 1 });
  }

  /**
   * A date field is never applied while it is being edited: a native date input
   * reports a value as soon as the segment being typed is full (`20` arrives as
   * `02`), and the calendar widget emits one on every month step. Changes are
   * applied when the field is left, on Enter, or from the Apply dates button.
   */
  function changeDate(field: 'from' | 'to', value: string) {
    setDates((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: errorFor(field, value) }));
  }

  return (
    <section className="card filters">
      <div className="filter-row">
        <label>
          Created from
          <input
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={dates.from}
            aria-invalid={errors.from ? true : undefined}
            onChange={(event) => changeDate('from', event.target.value)}
            onBlur={applyDates}
            onKeyDown={(event) => event.key === 'Enter' && applyDates()}
          />
          {errors.from && <span className="field-error">{errors.from}</span>}
        </label>
        <label>
          Created to
          <input
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={dates.to}
            aria-invalid={errors.to ? true : undefined}
            onChange={(event) => changeDate('to', event.target.value)}
            onBlur={applyDates}
            onKeyDown={(event) => event.key === 'Enter' && applyDates()}
          />
          {errors.to && <span className="field-error">{errors.to}</span>}
        </label>
        {datesDirty && (
          <button type="button" className="button" disabled={!datesValid} onClick={applyDates}>
            Apply dates
          </button>
        )}
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
