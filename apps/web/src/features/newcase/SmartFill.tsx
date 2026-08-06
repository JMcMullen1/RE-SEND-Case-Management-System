import { useRef, useState } from 'react';
import type { IntakeResponse, IntakeResult } from '@re-send/shared';
import { smartFillFile, smartFillText } from '../../api/intake';

type Source = 'form' | 'email';

const ACCEPT = '.pdf,.docx,.html,.htm,.eml,.txt';

/**
 * Smart fill for the add-case form. Accepts a JotForm submission (PDF, DOCX,
 * HTML, .eml) or a plain enquiry email — dropped, chosen, or pasted. It does not
 * create a second creation path: it prefills the same form, and everything else
 * (review, duplicate detection, Create) is unchanged. The form stays fully
 * usable if smart fill is switched off or fails.
 */
export function SmartFill({
  onResult,
}: {
  onResult: (result: IntakeResult) => void;
}) {
  const [source, setSource] = useState<Source>('form');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (run: () => Promise<IntakeResponse>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await run();
      if (res.status === 'ok') {
        const found = countFilled(res.result);
        setNotice(
          found > 0
            ? `Prefilled ${found} field${found === 1 ? '' : 's'}. Check the highlighted fields, then Create.`
            : 'Nothing could be read from this — fill the form manually.',
        );
        onResult(res.result);
      } else if (res.status === 'disabled') {
        setNotice('Smart fill is switched off. Fill the form manually.');
      } else if (res.status === 'refused') {
        setNotice('Smart fill declined this file. Fill the form manually.');
      } else {
        setNotice(res.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File) =>
    handle(() =>
      smartFillFile(
        file,
        file.name.toLowerCase().endsWith('.eml') ? 'email' : source,
      ),
    );

  return (
    <section className="mb-8 rounded-lg border border-resend-lilac bg-gray-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-resend-purple">
            Smart fill
          </h2>
          <p className="text-xs text-gray-500">
            Drop a query form or enquiry email to prefill the form. Nothing is
            saved until you press Create.
          </p>
        </div>
        <div
          className="flex overflow-hidden rounded-md border border-gray-200 text-xs"
          role="radiogroup"
          aria-label="Submission source"
        >
          {(['form', 'email'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={source === s}
              onClick={() => setSource(s)}
              className={`px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                source === s
                  ? 'bg-resend-purple text-white'
                  : 'bg-white text-resend-ink'
              }`}
            >
              {s === 'form' ? 'Query form' : 'Enquiry email'}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
        disabled={busy}
        className={`flex w-full flex-col items-center rounded-lg border-2 border-dashed px-4 py-6 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
          dragging
            ? 'border-resend-purple bg-white text-resend-purple'
            : 'border-gray-300 text-gray-500'
        }`}
      >
        {busy
          ? 'Reading…'
          : 'Drop a PDF, DOCX, HTML or .eml here, or click to choose'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          e.target.value = '';
        }}
      />

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-resend-purple">
          Or paste the text
        </summary>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder="Paste the enquiry email or form text here"
          className="mt-2 w-full rounded-md border border-gray-200 p-2 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
        <button
          type="button"
          disabled={busy || paste.trim().length === 0}
          onClick={() => void handle(() => smartFillText(paste, source))}
          className="mt-2 rounded-md bg-resend-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Smart fill from text
        </button>
      </details>

      {notice && (
        <p className="mt-3 text-xs text-resend-ink" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function countFilled(result: IntakeResult): number {
  return (
    Object.keys(result.client).length +
    Object.keys(result.child).length +
    Object.keys(result.case).length +
    result.keyDates.length
  );
}
