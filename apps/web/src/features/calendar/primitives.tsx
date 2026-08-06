import {
  KEY_DATE_TYPE_COLOR_VAR,
  KEY_DATE_TYPE_LABELS,
  KEY_DATE_TYPE_VALUES,
  isWorkingDay,
  type Holidays,
  type KeyDateType,
} from '@re-send/shared';

/** A small colour swatch for a key-date type (colour from branding via config). */
export function TypeDot({ type }: { type: KeyDateType }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: KEY_DATE_TYPE_COLOR_VAR[type] }}
    />
  );
}

/** The legend mapping each type to its colour, shown under the calendar. */
export function TypeLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {KEY_DATE_TYPE_VALUES.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <TypeDot type={t} />
          {KEY_DATE_TYPE_LABELS[t]}
        </li>
      ))}
    </ul>
  );
}

/**
 * A date input that is working-day aware: it tells the user when the date they
 * pick is a weekend or an England & Wales bank holiday, and offers to nudge it
 * to the next working day. The nudge uses the same utility as deadline maths.
 */
export function WorkingDayField({
  value,
  onChange,
  holidays,
  label,
  id,
}: {
  value: string;
  onChange: (date: string) => void;
  holidays: Holidays | null;
  label: string;
  id: string;
}) {
  const working = value && holidays ? isWorkingDay(value, holidays) : true;
  const note =
    value && holidays && !working
      ? holidays.has(value)
        ? `${holidays.title(value) ?? 'Bank holiday'} — not a working day`
        : 'Weekend — not a working day'
      : null;

  const nudge = () => {
    if (!holidays) return;
    let d = value;
    for (let i = 0; i < 14 && !isWorkingDay(d, holidays); i += 1) {
      d = nextDay(d);
    }
    onChange(d);
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      />
      {note && (
        <p className="mt-1 flex items-center gap-2 text-xs text-status-amber">
          <span>{note}</span>
          <button
            type="button"
            onClick={nudge}
            className="rounded underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Use next working day
          </button>
        </p>
      )}
    </div>
  );
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return date.toISOString().slice(0, 10);
}
