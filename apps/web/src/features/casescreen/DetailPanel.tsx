import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  calculateAge,
  CONSULTATION_STATE_VALUES,
  ENQUIRY_METHOD_VALUES,
  formatCivilDate,
  SCHOOL_YEAR_VALUES,
  TEAM_VALUES,
  type CaseDetail,
  type Team,
} from '@re-send/shared';
import { EditableField, type SelectOption } from './EditableField';
import { KeyDatesEditor } from './KeyDatesEditor';
import type { useCaseMutations } from '../../hooks/useCaseScreen';

type Mutations = ReturnType<typeof useCaseMutations>;

const opts = (values: readonly string[]): SelectOption[] =>
  values.map((v) => ({ value: v, label: v }));

/** A one-click copy control, shown beside a field's label when it has a value. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="text-gray-300 transition-colors hover:text-resend-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
    >
      {copied ? (
        <span className="text-resend-green" aria-hidden="true">
          ✓
        </span>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}

function Field({
  label,
  copy,
  span2,
  children,
}: {
  label: string;
  /** When a non-empty string, a copy button is shown beside the label. */
  copy?: string | null;
  /** Span both columns of the details grid (for long/one-line-wide fields). */
  span2?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`py-1 ${span2 ? 'sm:col-span-2' : ''}`}>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-400">
        {label}
        {copy != null && copy !== '' && (
          <CopyButton value={copy} label={label} />
        )}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function DetailPanel({
  detail,
  today,
  mutations,
  onUploadDirections,
  directionsBusy,
}: {
  detail: CaseDetail;
  today: string;
  mutations: Mutations;
  onUploadDirections: (file: File) => void;
  directionsBusy: boolean;
}) {
  const [showSecondary, setShowSecondary] = useState(false);
  const directionsRef = useRef<HTMLInputElement>(null);
  const { client, child } = detail;

  const caseField = (
    label: string,
    key: string,
    value: string | null,
    type?: 'text' | 'date' | 'select' | 'textarea',
    o?: SelectOption[],
  ) => (
    <EditableField
      label={label}
      value={value}
      type={type}
      options={o}
      onSave={(v) => mutations.patchCase.mutate({ [key]: v })}
    />
  );
  const clientField = (
    label: string,
    key: string,
    value: string | null,
    type?: 'text' | 'date' | 'select' | 'textarea',
    o?: SelectOption[],
  ) =>
    client ? (
      <EditableField
        label={label}
        value={value}
        type={type}
        options={o}
        onSave={(v) =>
          mutations.patchClient.mutate({
            clientId: client.id,
            patch: { [key]: v },
          })
        }
      />
    ) : (
      <span className="text-sm text-gray-400">—</span>
    );
  const childField = (
    label: string,
    key: string,
    value: string | null,
    type?: 'text' | 'date' | 'select' | 'textarea',
    o?: SelectOption[],
  ) =>
    child ? (
      <EditableField
        label={label}
        value={value}
        type={type}
        options={o}
        onSave={(v) =>
          mutations.patchChild.mutate({
            childId: child.id,
            patch: { [key]: v },
          })
        }
      />
    ) : (
      <span className="text-sm text-gray-400">—</span>
    );

  const age = calculateAge(child?.dateOfBirth ?? null, today);

  return (
    <dl className="grid max-w-3xl grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
      <Field span2 label="Client name" copy={client?.fullName}>
        {clientField('Client name', 'fullName', client?.fullName ?? null)}
      </Field>
      <Field label="Case reference" copy={detail.caseReference}>
        <span className="font-medium text-resend-ink">
          {detail.caseReference}
        </span>
      </Field>
      <Field label="Appeal number">
        {caseField('Appeal number', 'appealNumber', detail.appealNumber)}
      </Field>
      <Field span2 label="Child name" copy={child?.fullName}>
        {childField('Child name', 'fullName', child?.fullName ?? null)}
      </Field>
      <Field label="Date of birth">
        <div className="flex items-baseline gap-2">
          {childField(
            'Date of birth',
            'dateOfBirth',
            child?.dateOfBirth ?? null,
            'date',
          )}
          {age !== null && (
            <span className="whitespace-nowrap text-xs text-gray-500">
              age {age}
            </span>
          )}
        </div>
      </Field>
      <Field label="School year">
        {childField(
          'School year',
          'schoolYear',
          child?.schoolYear ?? null,
          'select',
          opts(SCHOOL_YEAR_VALUES),
        )}
      </Field>
      <Field label="Current school" copy={child?.currentSchoolName}>
        {childField(
          'Current school',
          'currentSchoolName',
          child?.currentSchoolName ?? null,
        )}
      </Field>
      <Field label="Desired school" copy={child?.desiredSchool}>
        {childField(
          'Desired school',
          'desiredSchool',
          child?.desiredSchool ?? null,
        )}
      </Field>
      <Field span2 label="SEND needs" copy={child?.sendNeeds}>
        {childField(
          'SEND needs',
          'sendNeeds',
          child?.sendNeeds ?? null,
          'textarea',
        )}
      </Field>
      <Field label="LA" copy={child?.la}>
        {childField('LA', 'la', child?.la ?? null)}
      </Field>
      <Field span2 label="LA contacts">
        {child ? (
          <LaContactsEditor
            contacts={child.laContacts}
            onChange={(laContacts) =>
              mutations.patchChild.mutate({
                childId: child.id,
                patch: { laContacts },
              })
            }
          />
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </Field>

      <div className="mt-3 border-t border-gray-100 pt-3 sm:col-span-2">
        <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Key dates
        </dt>
        <dd>
          <KeyDatesEditor
            keyDates={detail.keyDates}
            today={today}
            onAdd={(input) => mutations.addKeyDate.mutate(input)}
            onEdit={(id, patch) => mutations.editKeyDate.mutate({ id, patch })}
            onRemove={(id) => mutations.removeKeyDate.mutate(id)}
          />
          <button
            type="button"
            onClick={() => directionsRef.current?.click()}
            disabled={directionsBusy}
            className="mt-2 text-sm font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
          >
            {directionsBusy ? 'Reading order…' : '+ Upload directions order'}
          </button>
          <input
            ref={directionsRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadDirections(file);
              e.target.value = '';
            }}
          />
        </dd>
      </div>

      <button
        type="button"
        onClick={() => setShowSecondary((v) => !v)}
        aria-expanded={showSecondary}
        className="mt-4 w-full border-t border-gray-100 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple sm:col-span-2"
      >
        {showSecondary ? '▾' : '▸'} More detail
      </button>

      {showSecondary && (
        <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 sm:col-span-2 sm:grid-cols-2">
          <Field label="Email" copy={client?.email}>
            {clientField('Email', 'email', client?.email ?? null)}
          </Field>
          <Field label="Phone" copy={client?.phone}>
            {clientField('Phone', 'phone', client?.phone ?? null)}
          </Field>
          <Field label="Mobile" copy={client?.mobile}>
            {clientField('Mobile', 'mobile', client?.mobile ?? null)}
          </Field>
          <Field label="Other contact" copy={client?.otherContact}>
            {clientField(
              'Other contact',
              'otherContact',
              client?.otherContact ?? null,
            )}
          </Field>
          <Field span2 label="Address" copy={client?.streetAddress}>
            {clientField(
              'Street address',
              'streetAddress',
              client?.streetAddress ?? null,
            )}
          </Field>
          <Field label="City" copy={client?.city}>
            {clientField('City', 'city', client?.city ?? null)}
          </Field>
          <Field label="Postcode" copy={client?.postcode}>
            {clientField('Postcode', 'postcode', client?.postcode ?? null)}
          </Field>
          <Field label="County" copy={client?.county}>
            {clientField('County', 'county', client?.county ?? null)}
          </Field>
          <Field label="Team">
            <TeamToggle
              team={detail.team}
              onChange={(team) => mutations.setTeams.mutate(team)}
            />
          </Field>
          <Field label="Method of enquiry">
            {caseField(
              'Method of enquiry',
              'methodOfEnquiry',
              detail.methodOfEnquiry,
              'select',
              opts(ENQUIRY_METHOD_VALUES),
            )}
          </Field>
          <Field label="Date of enquiry">
            <EditableField
              label="Date of enquiry"
              value={detail.dateOfEnquiry}
              type="date"
              display={(v) => (v ? formatCivilDate(v) : '')}
              onSave={(v) => mutations.patchCase.mutate({ dateOfEnquiry: v })}
            />
          </Field>
          <Field label="Consultation state">
            {caseField(
              'Consultation state',
              'consultStatus',
              detail.consultStatus,
              'select',
              opts(CONSULTATION_STATE_VALUES),
            )}
          </Field>
          <Field label="Support level" copy={detail.supportLevel}>
            {caseField('Support level', 'supportLevel', detail.supportLevel)}
          </Field>
        </div>
      )}
    </dl>
  );
}

/**
 * The LA contacts list: one free-text line per contact (name, email, phone —
 * however the caseworker records it), with add and remove. Saves the whole
 * trimmed, non-empty list on blur or removal.
 */
function LaContactsEditor({
  contacts,
  onChange,
}: {
  contacts: string[];
  onChange: (contacts: string[]) => void;
}) {
  const [rows, setRows] = useState<string[]>(contacts);
  useEffect(() => setRows(contacts), [contacts]);

  const commit = (next: string[]) =>
    onChange(next.map((s) => s.trim()).filter((s) => s !== ''));

  return (
    <div className="space-y-1.5">
      {rows.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={c}
            onChange={(e) =>
              setRows((prev) =>
                prev.map((r, j) => (j === i ? e.target.value : r)),
              )
            }
            onBlur={() => commit(rows)}
            placeholder="Name · email · phone"
            aria-label={`LA contact ${i + 1}`}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink placeholder:text-gray-400 focus:border-resend-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
          <button
            type="button"
            onClick={() => {
              const next = rows.filter((_, j) => j !== i);
              setRows(next);
              commit(next);
            }}
            aria-label={`Remove LA contact ${i + 1}`}
            className="shrink-0 rounded px-1 text-gray-400 hover:text-status-amber focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, ''])}
        className="text-xs font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        + Add contact
      </button>
    </div>
  );
}

function TeamToggle({
  team,
  onChange,
}: {
  team: Team[];
  onChange: (team: Team[]) => void;
}) {
  return (
    <div className="flex gap-3">
      {TEAM_VALUES.map((code) => {
        const on = team.includes(code);
        return (
          <label key={code} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={on}
              onChange={() =>
                onChange(on ? team.filter((t) => t !== code) : [...team, code])
              }
              className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
            />
            {code}
          </label>
        );
      })}
    </div>
  );
}
