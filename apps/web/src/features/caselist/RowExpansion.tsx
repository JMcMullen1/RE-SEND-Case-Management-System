import {
  formatCivilDate,
  relativeSince,
  selectPrimaryKeyDate,
  typeOfCase,
  NOTE_KIND_LABELS,
  type CaseListRow,
} from '@re-send/shared';
import { useExpansion } from '../../hooks/useCaseData';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-resend-ink">{children ?? '—'}</dd>
    </div>
  );
}

export function RowExpansion({
  row,
  today,
}: {
  row: CaseListRow;
  today: string;
}) {
  const { data, isLoading } = useExpansion(row.id, true);
  const { sameDay } = selectPrimaryKeyDate(row.keyDates, today);

  return (
    <div className="grid grid-cols-1 gap-6 bg-gray-50/60 px-6 py-4 md:grid-cols-3">
      <section className="md:col-span-2">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Recent notes
        </h4>
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {!isLoading && data && data.notes.length === 0 && (
          <p className="text-sm text-gray-400">No notes yet.</p>
        )}
        <ul className="space-y-2">
          {data?.notes.map((n, i) => (
            <li key={i} className="border-l-2 border-resend-lilac pl-3">
              <p className="text-sm text-resend-ink">
                <span className="mr-1.5 rounded bg-resend-purple px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white align-middle">
                  {NOTE_KIND_LABELS[n.kind]}
                </span>
                {n.body}
              </p>
              <p className="text-xs text-gray-500">
                {formatCivilDate(n.entryDate)} · {n.author ?? 'Unknown'} ·{' '}
                {relativeSince(n.entryDate, today)}
              </p>
            </li>
          ))}
        </ul>

        {sameDay.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Also on this day
            </h4>
            <ul className="space-y-1">
              {sameDay.map((k) => (
                <li key={k.id} className="text-sm text-resend-ink">
                  {k.title}
                  <span className="text-gray-500">
                    {' '}
                    · {formatCivilDate(k.date)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-1">
        <Field label="Type of case">
          {typeOfCase(row.currentWork, row.originalQuery) ?? '—'}
        </Field>
        <Field label="Status">{row.status}</Field>
        <Field label="Team">{row.team.join(', ') || '—'}</Field>
        <Field label="Method of enquiry">{row.methodOfEnquiry ?? '—'}</Field>
        <Field label="Date of enquiry">
          {row.dateOfEnquiry ? formatCivilDate(row.dateOfEnquiry) : '—'}
        </Field>
        <Field label="Email">
          {data?.email ? (
            <a
              className="text-resend-purple underline"
              href={`mailto:${data.email}`}
            >
              {data.email}
            </a>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Phone">{data?.phone ?? data?.mobile ?? '—'}</Field>
      </dl>
    </div>
  );
}
