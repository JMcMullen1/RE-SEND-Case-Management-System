import { useId } from 'react';
import {
  TIME_UNIT_MINUTES,
  durationProblem,
  formatMinutes,
  parseDuration,
  roundUpToUnit,
} from '@re-send/shared';

const QUICK = [15, 30, 45, 60, 90, 120];

/** The minutes a typed duration will be recorded as, or null if not recordable. */
export function recordedMinutes(text: string): number | null {
  const minutes = parseDuration(text);
  return durationProblem(minutes) ? null : roundUpToUnit(minutes!);
}

/**
 * "Time spent" for a billable: type it as people say it ("45m", "1h 30",
 * "1.5") or tap a common amount. Underneath, it says exactly what will be
 * recorded after rounding up to the 15-minute unit, so nothing is a surprise.
 */
export function DurationField({
  value,
  onChange,
  showProblem,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Show why the value cannot be recorded (e.g. after a save attempt). */
  showProblem: boolean;
}) {
  const id = useId();
  const minutes = parseDuration(value);
  const problem = value.trim() || showProblem ? durationProblem(minutes) : null;
  const recorded = problem || minutes === null ? null : roundUpToUnit(minutes);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-resend-ink">
          Time spent
        </label>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 45m or 1h 30m"
          aria-describedby={`${id}-hint`}
          aria-invalid={problem ? true : undefined}
          inputMode="text"
          className={`w-36 rounded-md border px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
            problem ? 'border-status-amber' : 'border-gray-200'
          }`}
        />
        {QUICK.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(formatMinutes(m))}
            aria-pressed={recorded === m}
            className={`rounded-full px-2 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
              recorded === m
                ? 'bg-resend-purple text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {formatMinutes(m)}
          </button>
        ))}
      </div>
      <p
        id={`${id}-hint`}
        className={`mt-1 text-xs ${problem ? 'text-status-amber' : 'text-gray-500'}`}
      >
        {problem ??
          (recorded !== null
            ? `Recorded as ${formatMinutes(recorded)}${
                minutes !== recorded
                  ? ` (rounded up to ${TIME_UNIT_MINUTES}-minute units)`
                  : ''
              }.`
            : `Recorded in ${TIME_UNIT_MINUTES}-minute units, rounded up.`)}
      </p>
    </div>
  );
}
