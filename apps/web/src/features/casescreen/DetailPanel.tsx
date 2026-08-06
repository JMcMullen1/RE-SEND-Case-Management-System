import { useState, type ReactNode } from 'react';
import {
  calculateAge,
  CONSULTATION_STATE_VALUES,
  DSPL_AREA_VALUES,
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function DetailPanel({
  detail,
  today,
  mutations,
}: {
  detail: CaseDetail;
  today: string;
  mutations: Mutations;
}) {
  const [showSecondary, setShowSecondary] = useState(false);
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
    <dl className="text-sm">
      <Field label="Client name">
        {clientField('Client name', 'fullName', client?.fullName ?? null)}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Case reference">
          <span className="font-medium text-resend-ink">
            {detail.caseReference}
          </span>
        </Field>
        <Field label="Appeal number">
          {caseField('Appeal number', 'appealNumber', detail.appealNumber)}
        </Field>
      </div>
      <Field label="Child name">
        {childField('Child name', 'fullName', child?.fullName ?? null)}
      </Field>
      <div className="grid grid-cols-2 gap-2">
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
      </div>
      <Field label="Current school">
        {childField(
          'Current school',
          'currentSchoolName',
          child?.currentSchoolName ?? null,
        )}
      </Field>
      <Field label="Desired school">
        {childField(
          'Desired school',
          'desiredSchool',
          child?.desiredSchool ?? null,
        )}
      </Field>
      <Field label="SEND needs">
        {childField(
          'SEND needs',
          'sendNeeds',
          child?.sendNeeds ?? null,
          'textarea',
        )}
      </Field>

      <div className="mt-3 border-t border-gray-100 pt-3">
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
        </dd>
      </div>

      <button
        type="button"
        onClick={() => setShowSecondary((v) => !v)}
        aria-expanded={showSecondary}
        className="mt-4 w-full border-t border-gray-100 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {showSecondary ? '▾' : '▸'} More detail
      </button>

      {showSecondary && (
        <div className="mt-2 space-y-1">
          <Field label="Email">
            {clientField('Email', 'email', client?.email ?? null)}
          </Field>
          <Field label="Phone">
            {clientField('Phone', 'phone', client?.phone ?? null)}
          </Field>
          <Field label="Mobile">
            {clientField('Mobile', 'mobile', client?.mobile ?? null)}
          </Field>
          <Field label="Other contact">
            {clientField(
              'Other contact',
              'otherContact',
              client?.otherContact ?? null,
            )}
          </Field>
          <Field label="Address">
            {clientField(
              'Street address',
              'streetAddress',
              client?.streetAddress ?? null,
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="City">
              {clientField('City', 'city', client?.city ?? null)}
            </Field>
            <Field label="Postcode">
              {clientField('Postcode', 'postcode', client?.postcode ?? null)}
            </Field>
          </div>
          <Field label="County">
            {clientField('County', 'county', client?.county ?? null)}
          </Field>
          <Field label="DSPL area">
            {clientField(
              'DSPL area',
              'dsplArea',
              client?.dsplArea ?? null,
              'select',
              opts(DSPL_AREA_VALUES),
            )}
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
          <Field label="Support level">
            {caseField('Support level', 'supportLevel', detail.supportLevel)}
          </Field>
        </div>
      )}
    </dl>
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
