import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  calculateAge,
  CONSULTATION_STATE_VALUES,
  DISCOUNT_CODE_VALUES,
  ENQUIRY_METHOD_VALUES,
  formatCivilDate,
  INTAKE_LOW_CONFIDENCE,
  londonToday,
  OWNER_QUEUE_VALUES,
  PAYMENT_CODE_VALUES,
  QUERY_TYPE_VALUES,
  SCHOOL_YEAR_VALUES,
  STATUS_VALUES,
  suggestSchoolYear,
  TEAM_VALUES,
  WORK_TYPE_VALUES,
  type CaseClientDetail,
  type IntakeRef,
  type IntakeResult,
  type Team,
} from '@re-send/shared';
import { fetchCaseDetail } from '../../api/caseScreen';
import {
  createCase,
  fetchClient,
  fetchMatches,
  type CreateCasePayload,
} from '../../api/createCase';
import { useUsers } from '../../hooks/useCaseData';
import { FormField } from './FormField';
import { DuplicateMatches } from './DuplicateMatches';
import { SmartFill } from './SmartFill';

const opts = (values: readonly string[]) =>
  values.map((v) => ({ value: v, label: v }));
const DRAFT_KEY = 'resend.newCaseDraft';

type Dict = Record<string, string>;

const EMPTY_CLIENT: Dict = {
  fullName: '',
  displayName: '',
  preferredName: '',
  email: '',
  phone: '',
  mobile: '',
  otherContact: '',
  streetAddress: '',
  city: '',
  county: '',
  postcode: '',
  additionalNeeds: '',
};
const EMPTY_CHILD: Dict = {
  fullName: '',
  preferredName: '',
  dateOfBirth: '',
  schoolYear: '',
  currentSchoolName: '',
  currentSchoolAddress: '',
  desiredSchool: '',
  sendNeeds: '',
};

const CLIENT_FLAGS = [
  'consentDataProcessing',
  'consentInformationSharing',
  'consentContact',
  'consentPrivacyNotice',
  'paymentPlanRequired',
] as const;
const CASE_FLAGS = [
  'finalPlanReceived',
  'appealLodged',
  'representationWanted',
] as const;
const EMPTY_FLAGS: Record<string, boolean> = Object.fromEntries(
  [...CLIENT_FLAGS, ...CASE_FLAGS].map((k) => [k, false]),
);

const CONSENT_LABELS: Record<string, string> = {
  consentDataProcessing: 'Data processing',
  consentInformationSharing: 'Information sharing',
  consentContact: 'Contact',
  consentPrivacyNotice: 'Privacy notice',
  paymentPlanRequired: 'Payment plan required',
};

function nonEmpty(dict: Dict, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if (dict[k]?.trim()) out[k] = dict[k]!.trim();
  return out;
}

interface IntakeKeyDateRow {
  date: string;
  title: string;
  type: string;
  confidence: number;
}

export function NewCasePage() {
  const today = londonToday(new Date());
  const params = new URLSearchParams(window.location.search);
  const fromCase = params.get('fromCase');
  const fromClient = params.get('fromClient');

  const users = useUsers().data?.users ?? [];

  const [client, setClient] = useState<Dict>(EMPTY_CLIENT);
  const [child, setChild] = useState<Dict>(EMPTY_CHILD);
  const [caseFields, setCaseFields] = useState<Dict>({
    dateOfEnquiry: today,
    currentWork: '',
    originalQuery: '',
    methodOfEnquiry: '',
    owner: '',
    status: 'Enquiry',
    consultStatus: '',
    supportLevel: '',
    aims: '',
    finalPlanIssuedDate: '',
    mediationStatus: '',
    paymentCode: '',
    discountCode: '',
    firstNote: '',
  });
  const [flags, setFlags] = useState<Record<string, boolean>>(EMPTY_FLAGS);
  const [team, setTeam] = useState<Team[]>([]);
  const [errors, setErrors] = useState<Dict>({});
  const [existingClientId, setExistingClientId] = useState<string | null>(null);
  const [existingChildId, setExistingChildId] = useState<string | null>(null);
  const [lockClient, setLockClient] = useState(false);
  const [lockChild, setLockChild] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  // Smart fill: which fields were machine-filled (key -> confidence), plus the
  // implied key dates and a reference to the stored submission.
  const [machine, setMachine] = useState<Record<string, number>>({});
  const [keyDatesReview, setKeyDatesReview] = useState<IntakeKeyDateRow[]>([]);
  const [intakeRef, setIntakeRef] = useState<IntakeRef | null>(null);

  const clearMark = (key: string) =>
    setMachine((m) => {
      if (!(key in m)) return m;
      const next = { ...m };
      delete next[key];
      return next;
    });

  const setC = (k: string, v: string) => {
    setClient((p) => ({ ...p, [k]: v }));
    clearMark(`client.${k}`);
  };
  const setCh = (k: string, v: string) => {
    setChild((p) => ({ ...p, [k]: v }));
    clearMark(`child.${k}`);
  };
  const setF = (k: string, v: string) => {
    setCaseFields((p) => ({ ...p, [k]: v }));
    clearMark(`case.${k}`);
  };
  const setFlag = (k: string, v: boolean) => {
    setFlags((p) => ({ ...p, [k]: v }));
    clearMark(`flag.${k}`);
  };

  // Machine-fill markers to spread onto a FormField.
  const mf = (key: string) => {
    const filled = key in machine;
    return {
      id: key,
      machineFilled: filled,
      lowConfidence: filled && (machine[key] ?? 1) <= INTAKE_LOW_CONFIDENCE,
    };
  };
  const flagMachine = (name: string) => {
    const key = `flag.${name}`;
    const filled = key in machine;
    return {
      filled,
      low: filled && (machine[key] ?? 1) <= INTAKE_LOW_CONFIDENCE,
    };
  };

  // --- Apply a smart-fill result -------------------------------------------
  const applyResult = (result: IntakeResult) => {
    // Compute the marks and value patches up front from the result — not inside
    // the setState updaters, whose callbacks run at commit time, after the focus
    // logic below would read them.
    const marks: Record<string, number> = {};
    const clientPatch: Dict = {};
    const childPatch: Dict = {};
    const casePatch: Dict = {};
    const flagPatch: Record<string, boolean> = {};

    for (const [k, v] of Object.entries(result.client)) {
      if ((CLIENT_FLAGS as readonly string[]).includes(k)) continue;
      clientPatch[k] = v.value;
      marks[`client.${k}`] = v.confidence;
    }
    for (const [k, v] of Object.entries(result.child)) {
      childPatch[k] = v.value;
      marks[`child.${k}`] = v.confidence;
    }
    for (const [k, v] of Object.entries(result.case)) {
      if ((CASE_FLAGS as readonly string[]).includes(k)) continue;
      casePatch[k] = v.value;
      marks[`case.${k}`] = v.confidence;
    }
    for (const name of [...CLIENT_FLAGS, ...CASE_FLAGS]) {
      const v = result.client[name] ?? result.case[name];
      if (v) {
        flagPatch[name] = v.value === 'true';
        marks[`flag.${name}`] = v.confidence;
      }
    }

    setClient((prev) => ({ ...prev, ...clientPatch }));
    setChild((prev) => ({ ...prev, ...childPatch }));
    setCaseFields((prev) => ({ ...prev, ...casePatch }));
    setFlags((prev) => ({ ...prev, ...flagPatch }));
    setKeyDatesReview(result.keyDates);
    setIntakeRef(result.ref);
    setMachine(marks);

    // Focus the lowest-confidence text field first, so the riskiest value is
    // checked before anything else.
    const lowest = Object.entries(marks)
      .filter(([k]) => !k.startsWith('flag.'))
      .sort((a, b) => a[1] - b[1])[0];
    if (lowest) {
      window.setTimeout(() => {
        document.getElementById(lowest[0])?.focus();
      }, 50);
    }
  };

  // --- Prefill from an existing case or client -----------------------------
  const applyClient = (c: CaseClientDetail) => {
    setClient({
      fullName: c.fullName,
      displayName: c.displayName,
      preferredName: c.preferredName ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      mobile: c.mobile ?? '',
      otherContact: c.otherContact ?? '',
      streetAddress: c.streetAddress ?? '',
      city: c.city ?? '',
      county: c.county ?? '',
      postcode: c.postcode ?? '',
      additionalNeeds: c.additionalNeeds ?? '',
    });
    setExistingClientId(c.id);
    setLockClient(true);
  };

  const caseDetailQ = useQuery({
    queryKey: ['case-detail', fromCase],
    queryFn: () => fetchCaseDetail(fromCase!),
    enabled: Boolean(fromCase),
  });
  const clientQ = useQuery({
    queryKey: ['client', fromClient],
    queryFn: () => fetchClient(fromClient!),
    enabled: Boolean(fromClient),
  });
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    if (fromCase && caseDetailQ.data?.client) {
      const d = caseDetailQ.data;
      applyClient(d.client!);
      if (d.child) {
        setChild({
          fullName: d.child.fullName,
          preferredName: d.child.preferredName ?? '',
          dateOfBirth: d.child.dateOfBirth ?? '',
          schoolYear: d.child.schoolYear ?? '',
          currentSchoolName: d.child.currentSchoolName ?? '',
          currentSchoolAddress: d.child.currentSchoolAddress ?? '',
          desiredSchool: d.child.desiredSchool ?? '',
          sendNeeds: d.child.sendNeeds ?? '',
        });
        setExistingChildId(d.child.id);
        setLockChild(true);
      }
      prefilled.current = true;
    } else if (fromClient && clientQ.data) {
      applyClient(clientQ.data);
      prefilled.current = true;
    }
  }, [caseDetailQ.data, clientQ.data, fromCase, fromClient]);

  // --- Draft (local, so a half-taken phone enquiry is not lost) ------------
  const isPrefill = Boolean(fromCase || fromClient);
  useEffect(() => {
    if (isPrefill) return;
    if (localStorage.getItem(DRAFT_KEY)) setShowDraftPrompt(true);
  }, [isPrefill]);
  useEffect(() => {
    if (isPrefill) return;
    const id = window.setTimeout(() => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ client, child, caseFields, team }),
      );
    }, 600);
    return () => window.clearTimeout(id);
  }, [client, child, caseFields, team, isPrefill]);

  const resumeDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
      if (d.client) setClient({ ...EMPTY_CLIENT, ...d.client });
      if (d.child) setChild({ ...EMPTY_CHILD, ...d.child });
      if (d.caseFields) setCaseFields((p) => ({ ...p, ...d.caseFields }));
      if (Array.isArray(d.team)) setTeam(d.team);
    } catch {
      /* ignore */
    }
    setShowDraftPrompt(false);
  };
  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftPrompt(false);
  };

  // --- Duplicate detection --------------------------------------------------
  const [matchParams, setMatchParams] = useState<{
    childName?: string;
    dob?: string;
    email?: string;
  }>({});
  useEffect(() => {
    const id = window.setTimeout(() => {
      setMatchParams({
        childName: child.fullName || undefined,
        dob: child.dateOfBirth || undefined,
        email: client.email || undefined,
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [child.fullName, child.dateOfBirth, client.email]);

  const canMatch =
    !existingClientId &&
    ((Boolean(matchParams.childName) && Boolean(matchParams.dob)) ||
      Boolean(matchParams.email?.includes('@')));
  const matchesQ = useQuery({
    queryKey: ['matches', matchParams],
    queryFn: () => fetchMatches(matchParams),
    enabled: canMatch,
  });

  const attachClient = async (clientId: string) => {
    const detail = await fetchClient(clientId);
    applyClient(detail);
  };
  const useExistingChild = async (childId: string, clientId: string | null) => {
    setExistingChildId(childId);
    setLockChild(true);
    if (clientId) await attachClient(clientId);
  };

  // --- Suggestions ----------------------------------------------------------
  const age = calculateAge(child.dateOfBirth || null, today);
  const yearSuggestion = suggestSchoolYear(child.dateOfBirth || null, today);

  // --- Validation -----------------------------------------------------------
  const validateField = (
    key: string,
    value: string | undefined,
    message: string,
  ) => {
    setErrors((e) => {
      const next = { ...e };
      if (!(value ?? '').trim()) next[key] = message;
      else delete next[key];
      return next;
    });
  };

  const create = useMutation({
    mutationFn: (payload: CreateCasePayload) => createCase(payload),
    onSuccess: (res) => {
      localStorage.removeItem(DRAFT_KEY);
      window.location.href = `/cases/${res.caseId}?created=1`;
    },
  });

  const submit = () => {
    const nextErrors: Dict = {};
    if (!existingClientId && !(client.fullName ?? '').trim())
      nextErrors.clientFullName = 'Client full name is required';
    if (!existingChildId && !(child.fullName ?? '').trim())
      nextErrors.childFullName = 'Child full name is required';
    if (!(caseFields.currentWork ?? '').trim())
      nextErrors.currentWork = 'Type of case is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: CreateCasePayload = { case: {} };
    if (existingClientId) payload.existingClientId = existingClientId;
    else {
      const clientOut: Record<string, unknown> = nonEmpty(
        client,
        Object.keys(EMPTY_CLIENT),
      );
      for (const k of CLIENT_FLAGS) if (flags[k]) clientOut[k] = true;
      payload.client = clientOut;
    }
    if (existingChildId) payload.existingChildId = existingChildId;
    else payload.child = nonEmpty(child, Object.keys(EMPTY_CHILD));

    const caseOut: Record<string, unknown> = {
      currentWork: caseFields.currentWork,
      ...nonEmpty(caseFields, [
        'dateOfEnquiry',
        'originalQuery',
        'methodOfEnquiry',
        'status',
        'consultStatus',
        'supportLevel',
        'aims',
        'finalPlanIssuedDate',
        'mediationStatus',
        'paymentCode',
        'discountCode',
      ]),
    };
    if (flags.appealLodged) caseOut.appealLodged = true;
    if (flags.representationWanted) caseOut.representationWanted = true;
    if (team.length) caseOut.team = team;
    const owner = caseFields.owner ?? '';
    if (owner.startsWith('user:')) caseOut.ownerUserId = owner.slice(5);
    else if (owner.startsWith('queue:')) caseOut.ownerQueue = owner.slice(6);
    payload.case = caseOut;
    const firstNote = (caseFields.firstNote ?? '').trim();
    if (firstNote) payload.firstNote = firstNote;

    if (keyDatesReview.length > 0)
      payload.keyDates = keyDatesReview.map((k) => ({
        date: k.date,
        title: k.title,
        type: k.type,
        confidence: k.confidence,
      }));
    if (intakeRef) payload.intake = intakeRef;

    create.mutate(payload);
  };

  const ownerOptions = useMemo(
    () => [
      ...users.map((u) => ({ value: `user:${u.id}`, label: u.displayName })),
      ...OWNER_QUEUE_VALUES.map((q) => ({
        value: `queue:${q}`,
        label: `Queue: ${q}`,
      })),
    ],
    [users],
  );

  const applyLink = (onApply: () => void, text: string) => (
    <button
      type="button"
      onClick={onApply}
      className="text-xs font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
    >
      {text}
    </button>
  );

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <a href="/" className="text-sm text-resend-purple hover:underline">
            ← Cases
          </a>
          <h1 className="text-2xl font-semibold text-resend-purple">
            Add a case
          </h1>
          <p className="text-sm text-gray-500">
            Only client name, child name and type of case are required — the
            rest can follow.
          </p>
        </div>
      </div>

      {!isPrefill && <SmartFill onResult={applyResult} />}

      {showDraftPrompt && (
        <div className="mb-6 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <span className="text-resend-ink">You have an unfinished draft.</span>
          <span className="flex gap-3">
            {applyLink(resumeDraft, 'Resume draft')}
            {applyLink(discardDraft, 'Discard')}
          </span>
        </div>
      )}

      {canMatch && matchesQ.data && (
        <div className="mb-6">
          <DuplicateMatches
            matches={matchesQ.data}
            onAttachClient={(id) => void attachClient(id)}
            onUseChild={(childId, clientId) =>
              void useExistingChild(childId, clientId)
            }
          />
        </div>
      )}

      {/* CLIENT */}
      <Section
        title="Client"
        note={existingClientId ? 'Attached to an existing client.' : undefined}
        onDetach={
          existingClientId && !fromCase && !fromClient
            ? () => {
                setExistingClientId(null);
                setLockClient(false);
                setClient(EMPTY_CLIENT);
              }
            : undefined
        }
      >
        <FormField
          label="Full name"
          required
          value={client.fullName}
          disabled={lockClient}
          onChange={(v) => setC('fullName', v)}
          onBlur={() =>
            validateField(
              'clientFullName',
              client.fullName,
              'Client full name is required',
            )
          }
          error={errors.clientFullName}
          {...mf('client.fullName')}
        />
        <FormField
          label="Display name"
          value={client.displayName}
          disabled={lockClient}
          onChange={(v) => setC('displayName', v)}
          placeholder="Surname, First — filled automatically if left blank"
          {...mf('client.displayName')}
        />
        <FormField
          label="Preferred name"
          value={client.preferredName}
          disabled={lockClient}
          onChange={(v) => setC('preferredName', v)}
          {...mf('client.preferredName')}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Email"
            type="email"
            value={client.email}
            disabled={lockClient}
            onChange={(v) => setC('email', v)}
            {...mf('client.email')}
          />
          <FormField
            label="Phone"
            value={client.phone}
            disabled={lockClient}
            onChange={(v) => setC('phone', v)}
            {...mf('client.phone')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Mobile"
            value={client.mobile}
            disabled={lockClient}
            onChange={(v) => setC('mobile', v)}
            {...mf('client.mobile')}
          />
          <FormField
            label="Other contact"
            value={client.otherContact}
            disabled={lockClient}
            onChange={(v) => setC('otherContact', v)}
          />
        </div>
        <FormField
          label="Street address"
          value={client.streetAddress}
          disabled={lockClient}
          onChange={(v) => setC('streetAddress', v)}
          {...mf('client.streetAddress')}
        />
        <div className="grid grid-cols-3 gap-4">
          <FormField
            label="City"
            value={client.city}
            disabled={lockClient}
            onChange={(v) => setC('city', v)}
          />
          <FormField
            label="County"
            value={client.county}
            disabled={lockClient}
            onChange={(v) => setC('county', v)}
          />
          <FormField
            label="Postcode"
            value={client.postcode}
            disabled={lockClient}
            onChange={(v) => setC('postcode', v)}
            {...mf('client.postcode')}
          />
        </div>
        <FormField
          label="Additional needs"
          type="textarea"
          value={client.additionalNeeds}
          disabled={lockClient}
          onChange={(v) => setC('additionalNeeds', v)}
          {...mf('client.additionalNeeds')}
        />

        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Consents & payment
          </span>
          <div className="grid grid-cols-2 gap-2">
            {CLIENT_FLAGS.map((name) => {
              const m = flagMachine(name);
              return (
                <label
                  key={name}
                  className="flex items-center gap-2 text-sm text-resend-ink"
                >
                  <input
                    type="checkbox"
                    checked={flags[name] ?? false}
                    disabled={lockClient}
                    onChange={(e) => setFlag(name, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
                  />
                  {CONSENT_LABELS[name]}
                  {m.filled && (
                    <span
                      className={`rounded px-1 text-[10px] font-semibold ${
                        m.low
                          ? 'border border-status-amber text-resend-ink'
                          : 'bg-resend-lilac text-white'
                      }`}
                    >
                      {m.low ? 'AI · check' : 'AI'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </Section>

      {/* CHILD */}
      <Section
        title="Child"
        note={existingChildId ? 'Using an existing child.' : undefined}
      >
        <FormField
          label="Full name"
          required
          value={child.fullName}
          disabled={lockChild}
          onChange={(v) => setCh('fullName', v)}
          onBlur={() =>
            validateField(
              'childFullName',
              child.fullName,
              'Child full name is required',
            )
          }
          error={errors.childFullName}
          {...mf('child.fullName')}
        />
        <FormField
          label="Preferred name"
          value={child.preferredName}
          disabled={lockChild}
          onChange={(v) => setCh('preferredName', v)}
          {...mf('child.preferredName')}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Date of birth"
            type="date"
            value={child.dateOfBirth}
            disabled={lockChild}
            onChange={(v) => setCh('dateOfBirth', v)}
            adornment={age !== null ? `age ${age}` : undefined}
            {...mf('child.dateOfBirth')}
          />
          <FormField
            label="School year"
            type="select"
            options={opts(SCHOOL_YEAR_VALUES)}
            value={child.schoolYear}
            disabled={lockChild}
            onChange={(v) => setCh('schoolYear', v)}
            {...mf('child.schoolYear')}
            suggestion={
              !lockChild &&
              yearSuggestion &&
              yearSuggestion !== child.schoolYear
                ? applyLink(
                    () => setCh('schoolYear', yearSuggestion),
                    `Suggested from DOB: ${yearSuggestion} — apply`,
                  )
                : undefined
            }
          />
        </div>
        <FormField
          label="Current school name"
          value={child.currentSchoolName}
          disabled={lockChild}
          onChange={(v) => setCh('currentSchoolName', v)}
          {...mf('child.currentSchoolName')}
        />
        <FormField
          label="Current school address"
          value={child.currentSchoolAddress}
          disabled={lockChild}
          onChange={(v) => setCh('currentSchoolAddress', v)}
          {...mf('child.currentSchoolAddress')}
        />
        <FormField
          label="Desired school"
          value={child.desiredSchool}
          disabled={lockChild}
          onChange={(v) => setCh('desiredSchool', v)}
        />
        <FormField
          label="SEND needs"
          type="textarea"
          value={child.sendNeeds}
          disabled={lockChild}
          onChange={(v) => setCh('sendNeeds', v)}
          {...mf('child.sendNeeds')}
        />
      </Section>

      {/* CASE */}
      <Section title="Case">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Date of enquiry"
            type="date"
            value={caseFields.dateOfEnquiry}
            onChange={(v) => setF('dateOfEnquiry', v)}
          />
          <FormField
            label="Type of case"
            required
            type="select"
            options={opts(WORK_TYPE_VALUES)}
            value={caseFields.currentWork}
            onChange={(v) => setF('currentWork', v)}
            onBlur={() =>
              validateField(
                'currentWork',
                caseFields.currentWork,
                'Type of case is required',
              )
            }
            error={errors.currentWork}
            {...mf('case.currentWork')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Query type"
            type="select"
            options={opts(QUERY_TYPE_VALUES)}
            value={caseFields.originalQuery}
            onChange={(v) => setF('originalQuery', v)}
            {...mf('case.originalQuery')}
          />
          <FormField
            label="Method of enquiry"
            type="select"
            options={opts(ENQUIRY_METHOD_VALUES)}
            value={caseFields.methodOfEnquiry}
            onChange={(v) => setF('methodOfEnquiry', v)}
            {...mf('case.methodOfEnquiry')}
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Team
          </span>
          <div className="flex gap-4">
            {TEAM_VALUES.map((code) => (
              <label
                key={code}
                className="flex items-center gap-1 text-sm text-resend-ink"
              >
                <input
                  type="checkbox"
                  checked={team.includes(code)}
                  onChange={() =>
                    setTeam((t) =>
                      t.includes(code)
                        ? t.filter((x) => x !== code)
                        : [...t, code],
                    )
                  }
                  className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
                />
                {code}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Owner"
            type="select"
            options={ownerOptions}
            value={caseFields.owner}
            onChange={(v) => setF('owner', v)}
            placeholder="Unassigned (Enquiries queue)"
          />
          <FormField
            label="Status"
            type="select"
            options={opts(STATUS_VALUES)}
            value={caseFields.status}
            onChange={(v) => setF('status', v)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Consultation state"
            type="select"
            options={opts(CONSULTATION_STATE_VALUES)}
            value={caseFields.consultStatus}
            onChange={(v) => setF('consultStatus', v)}
          />
          <FormField
            label="Support level"
            value={caseFields.supportLevel}
            onChange={(v) => setF('supportLevel', v)}
            {...mf('case.supportLevel')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Payment code"
            type="select"
            options={opts(PAYMENT_CODE_VALUES)}
            value={caseFields.paymentCode}
            onChange={(v) => setF('paymentCode', v)}
          />
          <FormField
            label="Discount code"
            type="select"
            options={opts(DISCOUNT_CODE_VALUES)}
            value={caseFields.discountCode}
            onChange={(v) => setF('discountCode', v)}
          />
        </div>
        <FormField
          label="Aims"
          type="textarea"
          value={caseFields.aims}
          onChange={(v) => setF('aims', v)}
          placeholder="What the family wants to achieve"
          {...mf('case.aims')}
        />
        <FormField
          label="First note (optional)"
          type="textarea"
          value={caseFields.firstNote}
          onChange={(v) => setF('firstNote', v)}
          placeholder="Anything worth recording from the enquiry"
        />
      </Section>

      {/* ENQUIRY DETAILS */}
      <Section title="Enquiry details">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Final plan issued date"
            type="date"
            value={caseFields.finalPlanIssuedDate}
            onChange={(v) => setF('finalPlanIssuedDate', v)}
            {...mf('case.finalPlanIssuedDate')}
          />
          <FormField
            label="Mediation status"
            value={caseFields.mediationStatus}
            onChange={(v) => setF('mediationStatus', v)}
            {...mf('case.mediationStatus')}
          />
        </div>
        <div className="flex flex-wrap gap-6">
          {(
            [
              ['finalPlanReceived', 'Final plan received'],
              ['appealLodged', 'Appeal lodged'],
              ['representationWanted', 'Representation at hearing wanted'],
            ] as const
          ).map(([name, label]) => {
            const m = flagMachine(name);
            return (
              <label
                key={name}
                className="flex items-center gap-2 text-sm text-resend-ink"
              >
                <input
                  type="checkbox"
                  checked={flags[name] ?? false}
                  onChange={(e) => setFlag(name, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
                />
                {label}
                {m.filled && (
                  <span
                    className={`rounded px-1 text-[10px] font-semibold ${
                      m.low
                        ? 'border border-status-amber text-resend-ink'
                        : 'bg-resend-lilac text-white'
                    }`}
                  >
                    {m.low ? 'AI · check' : 'AI'}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {keyDatesReview.length > 0 && (
          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Key dates found — created with the case
            </span>
            <ul className="space-y-1">
              {keyDatesReview.map((k, i) => (
                <li
                  key={`${k.date}:${k.title}:${i}`}
                  className="flex items-center gap-3 rounded-md border border-resend-lilac px-3 py-1.5 text-sm"
                >
                  <span className="tabular-nums text-resend-ink">
                    {formatCivilDate(k.date)}
                  </span>
                  <span className="text-resend-ink">{k.title}</span>
                  <span className="text-xs text-gray-500">{k.type}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setKeyDatesReview((prev) =>
                        prev.filter((_, j) => j !== i),
                      )
                    }
                    className="ml-auto text-xs text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <div className="sticky bottom-0 mt-8 flex items-center justify-end gap-3 border-t border-gray-200 bg-white py-4">
        {create.isError && (
          <span className="mr-auto text-sm text-status-amber">
            Could not create the case. Please try again.
          </span>
        )}
        {!isPrefill &&
          applyLink(
            () =>
              localStorage.setItem(
                DRAFT_KEY,
                JSON.stringify({ client, child, caseFields, team }),
              ),
            'Save draft',
          )}
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className="rounded-lg bg-resend-purple px-5 py-2 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          {create.isPending ? 'Creating…' : 'Create case'}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  onDetach,
  children,
}: {
  title: string;
  note?: string;
  onDetach?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-resend-purple">
          {title}
        </h2>
        {note && (
          <span className="flex items-center gap-2 text-xs text-gray-500">
            {note}
            {onDetach && (
              <button
                type="button"
                onClick={onDetach}
                className="text-resend-purple hover:underline"
              >
                detach
              </button>
            )}
          </span>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
