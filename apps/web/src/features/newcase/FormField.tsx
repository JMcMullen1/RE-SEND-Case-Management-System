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
}) {
  const base = `w-full rounded-md border px-3 py-2 text-sm text-resend-ink placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:bg-gray-50 disabled:text-gray-500 ${
    error ? 'border-status-amber' : 'border-gray-200'
  }`;

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
        {required && <span className="ml-0.5 text-status-amber">*</span>}
      </span>
      <div className="flex items-center gap-2">
        {type === 'textarea' ? (
          <textarea
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
