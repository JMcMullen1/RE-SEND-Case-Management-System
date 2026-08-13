import { useState, type ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DirectionsReview as Review } from '@re-send/shared';
import { applyDirections, extractDirections } from '../../api/directions';
import { useToday } from '../../hooks/useToday';
import { useMe, useUsers } from '../../hooks/useCaseData';
import { useCaseDetail, useCaseMutations } from '../../hooks/useCaseScreen';
import { usePresence } from '../../realtime/RealtimeProvider';
import { DeleteCaseButton } from './DeleteCaseButton';
import { PresenceIndicator } from './PresenceIndicator';
import { CaseHeader } from './CaseHeader';
import { DetailPanel } from './DetailPanel';
import { DirectionsReview } from './DirectionsReview';
import { DocumentsRegion } from './DocumentsRegion';
import { EmailsRegion } from './EmailsRegion';
import { TimelineRegion } from './TimelineRegion';

type Tab = 'details' | 'docs-emails' | 'billables' | 'notes' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Case details' },
  { id: 'docs-emails', label: 'Documents / Emails' },
  { id: 'billables', label: 'Billables' },
  { id: 'notes', label: 'Case notes' },
  { id: 'all', label: 'All' },
];

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
  const [tab, setTab] = useState<Tab>('details');
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
      <DetailPanel
        detail={detail}
        today={today}
        mutations={mutations}
        onUploadDirections={uploadDirections}
        directionsBusy={directionsBusy && !review}
      />
    </section>
  );
  const docsEmailsSection = (
    <div className="grid h-full min-h-0 divide-x divide-gray-100 md:grid-cols-2">
      <section className="h-full overflow-auto p-5">
        <RegionHeading>Documents</RegionHeading>
        <DocumentsRegion caseId={caseId} />
      </section>
      <section className="h-full overflow-auto p-5">
        <RegionHeading>Emails</RegionHeading>
        <EmailsRegion />
      </section>
    </div>
  );
  const billablesSection = (
    <section className="flex h-full flex-col overflow-hidden p-5">
      <div className="min-h-0 flex-1">
        <TimelineRegion
          caseId={caseId}
          users={users}
          today={today}
          mutations={mutations}
          kind="billable"
        />
      </div>
    </section>
  );
  const notesSection = (
    <section className="flex h-full flex-col overflow-hidden p-5">
      <div className="min-h-0 flex-1">
        <TimelineRegion
          caseId={caseId}
          users={users}
          today={today}
          mutations={mutations}
          kind="note"
        />
      </div>
    </section>
  );
  // The "All" tab shows every region at once on one scrollable page, the way
  // the case screen read before it was split into tabs.
  const allSection = (
    <section className="h-full space-y-8 overflow-auto p-5">
      <div>
        <RegionHeading>Case detail</RegionHeading>
        <DetailPanel
          detail={detail}
          today={today}
          mutations={mutations}
          onUploadDirections={uploadDirections}
          directionsBusy={directionsBusy && !review}
        />
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <RegionHeading>Documents</RegionHeading>
          <DocumentsRegion caseId={caseId} />
        </div>
        <div>
          <RegionHeading>Emails</RegionHeading>
          <EmailsRegion />
        </div>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex h-[32rem] flex-col">
          <RegionHeading>Billables</RegionHeading>
          <div className="min-h-0 flex-1">
            <TimelineRegion
              caseId={caseId}
              users={users}
              today={today}
              mutations={mutations}
              kind="billable"
            />
          </div>
        </div>
        <div className="flex h-[32rem] flex-col">
          <RegionHeading>Case notes</RegionHeading>
          <div className="min-h-0 flex-1">
            <TimelineRegion
              caseId={caseId}
              users={users}
              today={today}
              mutations={mutations}
              kind="note"
            />
          </div>
        </div>
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
        <CaseHeader detail={detail} users={users} mutations={mutations} />
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

      <div
        role="tablist"
        aria-label="Case regions"
        className="flex gap-1 border-b border-gray-200 px-4"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
              tab === t.id
                ? 'border-b-2 border-resend-purple text-resend-purple'
                : 'text-gray-500 hover:text-resend-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="min-h-0 flex-1">
        {tab === 'details' && detailSection}
        {tab === 'docs-emails' && docsEmailsSection}
        {tab === 'billables' && billablesSection}
        {tab === 'notes' && notesSection}
        {tab === 'all' && allSection}
      </main>

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
