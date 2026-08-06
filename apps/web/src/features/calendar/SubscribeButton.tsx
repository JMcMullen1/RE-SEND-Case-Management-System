import { useState } from 'react';
import { fetchFeedUrl, rotateFeedUrl } from '../../api/calendar';

/**
 * The iCal subscribe control. It reveals the user's token-authenticated feed
 * URL (created lazily) so a phone's calendar app can subscribe — no Microsoft
 * integration needed. The token can be rotated to revoke the old URL.
 */
export function SubscribeButton() {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const absolute = path ? `${window.location.origin}${path}` : null;

  const reveal = () => {
    setOpen(true);
    if (!path) {
      setBusy(true);
      void fetchFeedUrl()
        .then((r) => setPath(r.path))
        .finally(() => setBusy(false));
    }
  };

  const rotate = () => {
    setBusy(true);
    setCopied(false);
    void rotateFeedUrl()
      .then((r) => setPath(r.path))
      .finally(() => setBusy(false));
  };

  const copy = () => {
    if (!absolute) return;
    void navigator.clipboard.writeText(absolute).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : reveal())}
        aria-expanded={open}
        className="rounded-lg border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-resend-lilac hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Subscribe (iCal)
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-xs text-gray-600">
            Add this feed to your phone or Outlook to see your key dates. Keep
            the link private — it grants read access to your calendar.
          </p>
          {busy && !absolute ? (
            <p className="mt-2 text-sm text-gray-400">Preparing feed…</p>
          ) : absolute ? (
            <>
              <input
                readOnly
                value={absolute}
                aria-label="iCal feed URL"
                onFocus={(e) => e.target.select()}
                className="mt-2 w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={copy}
                  className="rounded bg-resend-purple px-3 py-1 text-xs font-medium text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button
                  type="button"
                  onClick={rotate}
                  disabled={busy}
                  className="text-xs text-gray-500 underline hover:text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
                >
                  Reset link
                </button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-400">
              No feed available for the current user.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
