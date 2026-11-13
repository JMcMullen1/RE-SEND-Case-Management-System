import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PRODUCT_NAME,
  RATE_KIND_LABELS,
  RATE_KIND_VALUES,
  formatCivilDate,
  formatPence,
  parsePounds,
  type RateKind,
  type StaffRates,
} from '@re-send/shared';
import { fetchStaffRates, setStaffRate } from '../../api/time';
import { useMe } from '../../hooks/useCaseData';
import { useToday } from '../../hooks/useToday';

/**
 * Staff rates (admins only). Each member of staff has an hourly pay rate —
 * what their recorded time earns — and a work rate that QuickBooks will charge
 * at later. A rate applies from a date, so changing it never rewrites time
 * already recorded; setting one for the first time can be backdated.
 */
export function RatesPage() {
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const rates = useQuery({
    queryKey: ['staff-rates'],
    queryFn: fetchStaffRates,
    enabled: isAdmin,
  });
  const [editing, setEditing] = useState<{
    userId: string;
    kind: RateKind;
  } | null>(null);

  return (
    <div className="min-h-screen bg-white text-resend-ink">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-resend-purple">
              {PRODUCT_NAME} staff rates
            </h1>
            <p className="text-xs text-gray-500">
              Hourly rates for recorded time
            </p>
          </div>
          <a
            href="/time"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Time
          </a>
          <a
            href="/"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cases
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        {me.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {me.data && !isAdmin && (
          <p className="text-sm text-gray-600">
            Only an admin can see and set staff rates.
          </p>
        )}
        {isAdmin && (
          <>
            <p className="mb-4 max-w-2xl text-sm text-gray-600">
              <strong>Pay rate</strong> is what a person’s recorded time earns;
              they see it on their Time page. <strong>Work rate</strong> is what
              the work will be charged at in QuickBooks — leave it empty until
              it is agreed. A new rate applies from the date you choose, so time
              already recorded keeps the rate in force when it was worked.
            </p>
            {rates.isLoading && (
              <p className="text-sm text-gray-500">Loading…</p>
            )}
            {rates.data && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 font-medium">Staff</th>
                    {RATE_KIND_VALUES.map((k) => (
                      <th key={k} className="py-2 font-medium">
                        {RATE_KIND_LABELS[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rates.data.staff.map((s) => (
                    <tr key={s.userId} className="align-top">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{s.displayName}</p>
                        <p className="text-xs capitalize text-gray-500">
                          {s.role.replace('_', ' ')}
                        </p>
                      </td>
                      {RATE_KIND_VALUES.map((kind) => (
                        <td key={kind} className="py-3 pr-4">
                          {editing?.userId === s.userId &&
                          editing.kind === kind ? (
                            <RateForm
                              staff={s}
                              kind={kind}
                              onDone={() => setEditing(null)}
                            />
                          ) : (
                            <RateCell
                              staff={s}
                              kind={kind}
                              onEdit={() =>
                                setEditing({ userId: s.userId, kind })
                              }
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RateCell({
  staff,
  kind,
  onEdit,
}: {
  staff: StaffRates;
  kind: RateKind;
  onEdit: () => void;
}) {
  const rate = staff[kind];
  return (
    <div>
      {rate ? (
        <>
          <p className="tabular-nums">{formatPence(rate.ratePence)} / hour</p>
          <p className="text-xs text-gray-500">
            from {formatCivilDate(rate.effectiveFrom)}
          </p>
        </>
      ) : (
        <p className="text-gray-500">Not set</p>
      )}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${rate ? 'Change' : 'Set'} ${RATE_KIND_LABELS[kind].toLowerCase()} for ${staff.displayName}`}
        className="mt-0.5 text-xs text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {rate ? 'Change' : 'Set'}
      </button>
    </div>
  );
}

function RateForm({
  staff,
  kind,
  onDone,
}: {
  staff: StaffRates;
  kind: RateKind;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const today = useToday();
  const current = staff[kind];
  const [amount, setAmount] = useState(
    current ? (current.ratePence / 100).toFixed(2) : '',
  );
  // A first-ever rate usually needs to cover time already recorded, so it
  // defaults to the start of the year; a change defaults to today.
  const [from, setFrom] = useState(
    current ? today : `${today.slice(0, 4)}-01-01`,
  );
  const pence = parsePounds(amount);
  const save = useMutation({
    mutationFn: () =>
      setStaffRate({
        userId: staff.userId,
        kind,
        ratePence: pence!,
        effectiveFrom: from,
      }),
    onSuccess: (data) => {
      qc.setQueryData(['staff-rates'], data);
      void qc.invalidateQueries({ queryKey: ['time'] });
      onDone();
    },
  });

  const label = `${RATE_KIND_LABELS[kind]} for ${staff.displayName}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pence !== null && from) save.mutate();
      }}
      className="space-y-1.5"
    >
      <label className="block text-xs text-gray-500">
        £ per hour
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label={`${label}, pounds per hour`}
          aria-invalid={amount && pence === null ? true : undefined}
          autoFocus
          className="mt-0.5 block w-28 rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
      </label>
      <label className="block text-xs text-gray-500">
        Applies from
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label={`${label}, applies from`}
          className="mt-0.5 block rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
      </label>
      {amount && pence === null && (
        <p className="text-xs text-status-amber">Enter an amount like 18.50</p>
      )}
      {save.isError && (
        <p className="text-xs text-status-amber">Could not save. Try again.</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pence === null || !from || save.isPending}
          className="rounded-md bg-resend-purple px-2.5 py-1 text-xs font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
