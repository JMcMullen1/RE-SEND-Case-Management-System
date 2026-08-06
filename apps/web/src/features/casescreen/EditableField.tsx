import { useEffect, useRef, useState } from 'react';

type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'select';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A single field, editable in place. Click to edit; Enter or blur saves, Escape
 * cancels. Empty saves as null so a field can be cleared. Selects and dates
 * commit immediately.
 */
export function EditableField({
  value,
  type = 'text',
  options,
  placeholder = 'Add…',
  display,
  label,
  onSave,
}: {
  value: string | null;
  type?: FieldType;
  options?: SelectOption[];
  placeholder?: string;
  display?: (value: string | null) => string;
  label: string;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef<
    HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement
  >(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim() === '' ? null : draft;
    if (next !== value) onSave(next);
  };
  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const shared =
    'w-full rounded-md border border-resend-purple/40 bg-white px-2 py-1 text-sm text-resend-ink focus:border-resend-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

  if (editing) {
    if (type === 'textarea') {
      return (
        <div>
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
            }}
            rows={3}
            aria-label={label}
            className={shared}
          />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={commit}
              className="text-xs font-medium text-resend-purple"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-xs text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    if (type === 'select') {
      return (
        <select
          ref={ref}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            setEditing(false);
            const next = v === '' ? null : v;
            if (next !== value) onSave(next);
          }}
          onBlur={() => setEditing(false)}
          aria-label={label}
          className={shared}
        >
          <option value="">—</option>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        ref={ref}
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        aria-label={label}
        className={shared}
      />
    );
  }

  const shown = display ? display(value) : (value ?? '');
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group -mx-1 flex w-full items-center rounded px-1 py-0.5 text-left text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      aria-label={`Edit ${label}`}
    >
      <span className={shown ? 'text-resend-ink' : 'italic text-gray-400'}>
        {shown || placeholder}
      </span>
    </button>
  );
}
