import { useState } from 'react';
import {
  countActiveFilters,
  FACETS,
  FILTER_DAY_DEFAULTS,
  type CaseFilters,
  type FacetDef,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';

type Counts = Record<string, Record<string, number>>;
type OnChange = (filters: CaseFilters) => void;

function toggleValue(
  filters: CaseFilters,
  key: string,
  value: string | number,
): CaseFilters {
  const current = (filters as Record<string, unknown>)[key];
  const list = Array.isArray(current)
    ? [...(current as (string | number)[])]
    : [];
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(value);
  const next = { ...filters } as Record<string, unknown>;
  if (list.length) next[key] = list;
  else delete next[key];
  return next as CaseFilters;
}

function OptionList({
  facet,
  options,
  filters,
  counts,
  onChange,
}: {
  facet: FacetDef;
  options: { value: string | number; label: string }[];
  filters: CaseFilters;
  counts: Counts;
  onChange: OnChange;
}) {
  const selected = ((filters as Record<string, unknown>)[facet.id] ?? []) as (
    string | number
  )[];
  const facetCounts = counts[facet.id] ?? {};
  return (
    <fieldset className="border-t border-gray-100 py-2">
      <legend className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {facet.label}
      </legend>
      <div className="max-h-40 overflow-auto">
        {options.map((opt) => (
          <label
            key={String(opt.value)}
            className="flex cursor-pointer items-center justify-between px-3 py-1 text-sm hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() =>
                  onChange(toggleValue(filters, facet.id, opt.value))
                }
                className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
              />
              <span className="text-resend-ink">{opt.label}</span>
            </span>
            <span className="tabular-nums text-xs text-gray-400">
              {facetCounts[String(opt.value)] ?? 0}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function BooleanFacet({
  facet,
  filters,
  onChange,
}: {
  facet: FacetDef;
  filters: CaseFilters;
  onChange: OnChange;
}) {
  const key = facet.id as keyof CaseFilters;
  const checked = Boolean(filters[key]);
  return (
    <label className="flex cursor-pointer items-center gap-2 border-t border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {
          const next = { ...filters };
          if (checked) delete next[key];
          else (next as Record<string, unknown>)[key] = true;
          onChange(next);
        }}
        className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
      />
      <span className="text-resend-ink">{facet.label}</span>
    </label>
  );
}

function DaysFacet({
  facet,
  filters,
  onChange,
}: {
  facet: FacetDef;
  filters: CaseFilters;
  onChange: OnChange;
}) {
  const key = facet.id as keyof CaseFilters;
  const value = filters[key] as number | undefined;
  const fallback =
    FILTER_DAY_DEFAULTS[facet.id as keyof typeof FILTER_DAY_DEFAULTS] ?? 30;
  return (
    <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value !== undefined}
          onChange={() => {
            const next = { ...filters };
            if (value !== undefined) delete next[key];
            else (next as Record<string, unknown>)[key] = fallback;
            onChange(next);
          }}
          className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
        />
        <span className="text-resend-ink">{facet.label}</span>
      </label>
      {value !== undefined && (
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n > 0) onChange({ ...filters, [key]: n } as CaseFilters);
          }}
          aria-label={`${facet.label}: number of days`}
          className="w-16 rounded border border-gray-200 px-1 py-0.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
      )}
    </div>
  );
}

function optionsFor(
  facet: FacetDef,
  users: UserSummary[],
  counts: Counts,
): { value: string | number; label: string }[] {
  if (facet.source.kind === 'vocab') {
    return facet.source.values.map((v) => ({ value: v, label: v }));
  }
  if (facet.source.kind === 'users') {
    return users.map((u) => ({ value: u.id, label: u.displayName }));
  }
  if (facet.source.kind === 'dynamic') {
    return Object.keys(counts[facet.id] ?? {})
      .map((y) => Number(y))
      .sort((a, b) => b - a)
      .map((y) => ({ value: y, label: String(y) }));
  }
  return [];
}

export function FiltersPopover({
  filters,
  counts,
  users,
  onChange,
}: {
  filters: CaseFilters;
  counts: Counts;
  users: UserSummary[];
  onChange: OnChange;
}) {
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(filters);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        More filters
        {active > 0 && (
          <span className="rounded-full bg-resend-purple px-1.5 text-xs text-white">
            {active}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 max-h-[70vh] w-80 overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl">
            {FACETS.filter((f) => f.enabled).map((facet) => {
              if (facet.source.kind === 'boolean') {
                return (
                  <BooleanFacet
                    key={facet.id}
                    facet={facet}
                    filters={filters}
                    onChange={onChange}
                  />
                );
              }
              if (facet.source.kind === 'days') {
                return (
                  <DaysFacet
                    key={facet.id}
                    facet={facet}
                    filters={filters}
                    onChange={onChange}
                  />
                );
              }
              return (
                <OptionList
                  key={facet.id}
                  facet={facet}
                  options={optionsFor(facet, users, counts)}
                  filters={filters}
                  counts={counts}
                  onChange={onChange}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
