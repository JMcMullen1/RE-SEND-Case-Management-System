import type { ReactNode } from 'react';

interface Option {
  value: string;
  label: string;
}

export function FormField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  options,
  required,
  error,
  disabled,
  placeholder,
  adornment,
  suggestion,
  id,
  machineFilled,
  lowConfidence,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: 'text' | 'email' | 'date' | 'number' | 'textarea' | 'select';
  options?: Option[];
  required?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  adornment?: ReactNode;
  suggestion?: ReactNode;
  /** DOM id, used to focus the lowest-confidence smart-filled field first. */
  id?: string;
  /** Prefilled by smart fill and not yet edited. */
  machineFilled?: boolean;
  /** Machine-filled and below the confidence threshold — flag for a check. */
  lowConfidence?: boolean;
}) {
  const borderColour =
    error || (machineFilled && lowConfidence)
      ? 'border-status-amber'
      : machineFilled
        ? 'border-resend-purple'
        : 'border-gray-200';
  const base = `w-full rounded-md border px-3 py-2 text-sm text-resend-ink placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:bg-gray-50 disabled:text-gray-500 ${borderColour}`;

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <span>
          {label}
          {required && <span className="ml-0.5 text-status-amber">*</span>}
        </span>
        {machineFilled && (
          <span
            className={`rounded px-1 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${
              lowConfidence
                ? 'border border-status-amber text-resend-ink'
                : 'bg-resend-lilac text-white'
            }`}
          >
            {lowConfidence ? 'AI · check' : 'AI'}
          </span>
        )}
      </span>
      <div className="flex items-center gap-2">
        {type === 'textarea' ? (
          <textarea
            id={id}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={placeholder}
            rows={3}
            className={base}
          />
        ) : type === 'select' ? (
          <select
            id={id}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            className={base}
          >
            <option value="">—</option>
            {options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={type}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={placeholder}
            className={base}
          />
        )}
        {adornment && (
          <span className="shrink-0 whitespace-nowrap text-sm text-gray-500">
            {adornment}
          </span>
        )}
      </div>
      {suggestion && <div className="mt-1">{suggestion}</div>}
      {error && (
        <p
          className="mt-1 flex items-center gap-1 text-xs text-resend-ink"
          role="alert"
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-status-amber"
          />
          {error}
        </p>
      )}
    </label>
  );
}
