import { useState, type ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DirectionsReview as Review } from '@re-send/shared';
import { applyDirections, extractDirections } from '../../api/directions';
import { useToday } from '../../hooks/useToday';
import { useMe, useUsers } from '../../hooks/useCaseData';
import { useCaseDetail, useCaseMutations } from '../../hooks/useCaseScreen';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePresence } from '../../realtime/RealtimeProvider';
import { DeleteCaseButton } from './DeleteCaseButton';
import { PresenceIndicator } from './PresenceIndicator';
import { CaseHeader } from './CaseHeader';
import { DetailPanel } from './DetailPanel';
import { DirectionsReview } from './DirectionsReview';
import { DocumentsRegion } from './DocumentsRegion';
import { EmailsRegion } from './EmailsRegion';
import { TimelineRegion } from './TimelineRegion';

type Tab = 'timeline' | 'documents' | 'emails';

function RegionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </h2>
  );
}

export function CaseScreenPage() {
  const { caseId } = useParams({ from: '/cases/$caseId' });
  const today = useToday();
  const qc = useQueryClient();
  const others = usePresence(caseId);

  const detailQuery = useCaseDetail(caseId);
  const isAdmin = useMe().data?.role === 'admin';
  const users = useUsers().data?.users ?? [];
  const mutations = useCaseMutations(caseId);
  const wide = useMediaQuery('(min-width: 1400px)');
  const [tab, setTab] = useState<Tab>('timeline');
  const [justCreated, setJustCreated] = useState(
    () => new URLSearchParams(window.location.search).get('created') === '1',
  );

  // Directions ingestion: upload → review → apply. Nothing touches the calendar
  // until the review is applied.
  const [review, setReview] = useState<Review | null>(null);
  const [directionsBusy, setDirectionsBusy] = useState(false);
  const [directionsNote, setDirectionsNote] = useState<string | null>(null);

  const uploadDirections = (file: File) => {
    setDirectionsNote(null);
    setDirectionsBusy(true);
    void extractDirections(caseId, file)
      .then((res) => {
        if (res.status === 'ok') setReview(res.review);
        else if (res.status === 'disabled')
          setDirectionsNote(
            'Smart reading is switched off — the order was filed as a document.',
          );
        else if (res.status === 'refused')
          setDirectionsNote('The order could not be read automatically.');
        else setDirectionsNote(res.message);
      })
      .finally(() => setDirectionsBusy(false));
  };

  const applyReview: Parameters<typeof DirectionsReview>[0]['onApply'] = (
    rows,
  ) => {
    if (!review) return;
    setDirectionsBusy(true);
    void applyDirections(caseId, review.documentId, rows)
      .then((result) => {
        setReview(null);
        setDirectionsNote(`Calendar updated: ${result.summary}.`);
        qc.invalidateQueries({ queryKey: ['case-detail', caseId] });
        qc.invalidateQueries({ queryKey: ['documents', caseId] });
        qc.invalidateQueries({ queryKey: ['cases'] });
      })
      .catch((err: unknown) =>
        setDirectionsNote(
          err instanceof Error ? err.message : 'Could not apply the changes.',
        ),
      )
      .finally(() => setDirectionsBusy(false));
  };

  if (detailQuery.isLoading) {
    return (
      <p className="p-10 text-center text-sm text-gray-400">Loading case…</p>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-gray-500">This case could not be found.</p>
        <a
          href="/"
          className="mt-3 inline-block text-sm text-resend-purple underline"
        >
          Back to the case list
        </a>
      </div>
    );
  }

  const detail = detailQuery.data;

  const detailSection = (
    <section className="h-full overflow-auto p-5">
      <RegionHeading>Case detail</RegionHeading>
      <DetailPanel detail={detail} today={today} mutations={mutations} />
    </section>
  );
  const documentsSection = (
    <section className="h-full overflow-auto p-5">
      <RegionHeading>Documents</RegionHeading>
      <DocumentsRegion caseId={caseId} />
    </section>
  );
  const emailsSection = (
    <section className="h-full overflow-auto p-5">
      <RegionHeading>Emails</RegionHeading>
      <EmailsRegion />
    </section>
  );
  const timelineSection = (
    <section className="flex h-full flex-col overflow-hidden p-5">
      <RegionHeading>Time entries &amp; case notes</RegionHeading>
      <div className="min-h-0 flex-1">
        <TimelineRegion
          caseId={caseId}
          users={users}
          today={today}
          mutations={mutations}
        />
      </div>
    </section>
  );

  return (
    <div className="flex h-screen flex-col bg-white text-resend-ink">
      {justCreated && (
        <div className="flex items-center justify-between gap-3 border-l-4 border-resend-green bg-gray-50 px-6 py-2 text-sm">
          <span className="text-resend-ink">
            Case created. It opens here, not back on the list.
          </span>
          <span className="flex items-center gap-4">
            {detail.client && (
              <a
                href={`/cases/new?fromClient=${detail.client.id}`}
                className="font-medium text-resend-purple hover:underline"
              >
                Add another child for this client
              </a>
            )}
            <button
              type="button"
              onClick={() => setJustCreated(false)}
              aria-label="Dismiss"
              className="text-gray-500 hover:text-resend-ink"
            >
              ×
            </button>
          </span>
        </div>
      )}
      <header className="border-b border-gray-200 px-6 py-3">
        <CaseHeader
          detail={detail}
          users={users}
          mutations={mutations}
          onUploadDirections={uploadDirections}
          directionsBusy={directionsBusy && !review}
        />
        {directionsNote && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-1.5 text-sm text-gray-600">
            <span>{directionsNote}</span>
            <button
              type="button"
              onClick={() => setDirectionsNote(null)}
              aria-label="Dismiss"
              className="text-gray-400 hover:text-resend-ink"
            >
              ×
            </button>
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-2">
            <PresenceIndicator users={others} />
          </div>
        )}
        {isAdmin && (
          <div className="mt-2 flex justify-end">
            <DeleteCaseButton
              caseId={caseId}
              confirmName={detail.client?.fullName ?? detail.caseReference}
            />
          </div>
        )}
      </header>

      {wide ? (
        <main
          className="grid min-h-0 flex-1 divide-x divide-gray-100"
          style={{
            gridTemplateColumns:
              '340px minmax(0,1fr) minmax(0,1fr) minmax(0,1.7fr)',
          }}
        >
          {detailSection}
          {documentsSection}
          {emailsSection}
          {timelineSection}
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 divide-x divide-gray-100">
          <div className="w-[340px] shrink-0">{detailSection}</div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              role="tablist"
              aria-label="Case regions"
              className="flex gap-1 border-b border-gray-200 px-4 pt-3"
            >
              {(['timeline', 'documents', 'emails'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-t-md px-3 py-1.5 text-sm font-medium capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                    tab === t
                      ? 'border-b-2 border-resend-purple text-resend-purple'
                      : 'text-gray-500 hover:text-resend-ink'
                  }`}
                >
                  {t === 'timeline' ? 'Timeline' : t}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {tab === 'timeline' && timelineSection}
              {tab === 'documents' && documentsSection}
              {tab === 'emails' && emailsSection}
            </div>
          </div>
        </main>
      )}

      {review && (
        <DirectionsReview
          review={review}
          onApply={applyReview}
          onCancel={() => setReview(null)}
          applying={directionsBusy}
        />
      )}
    </div>
  );
}
