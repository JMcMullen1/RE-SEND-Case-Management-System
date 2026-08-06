import { useState, type ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { uploadDocument } from '../../api/caseScreen';
import { useToday } from '../../hooks/useToday';
import { useUsers } from '../../hooks/useCaseData';
import {
  useCaseDetail,
  useCaseMutations,
  useCaseRealtime,
} from '../../hooks/useCaseScreen';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { CaseHeader } from './CaseHeader';
import { DetailPanel } from './DetailPanel';
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
  useCaseRealtime(caseId);

  const detailQuery = useCaseDetail(caseId);
  const users = useUsers().data?.users ?? [];
  const mutations = useCaseMutations(caseId);
  const wide = useMediaQuery('(min-width: 1400px)');
  const [tab, setTab] = useState<Tab>('timeline');
  const [justCreated, setJustCreated] = useState(
    () => new URLSearchParams(window.location.search).get('created') === '1',
  );

  const uploadDirections = (file: File) => {
    void uploadDocument(caseId, file, 'Tribunal Order').then(() =>
      qc.invalidateQueries({ queryKey: ['documents', caseId] }),
    );
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
                Add another for this client
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
          today={today}
          mutations={mutations}
          onUploadDirections={uploadDirections}
        />
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
    </div>
  );
}
