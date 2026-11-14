/**
 * case-import.ts — reading the charity's existing case list (a spreadsheet)
 * into cases. Pure: the browser reads the workbook into rows of text, the API
 * supplies what is already on the system, and this decides, row by row, what
 * would be created, what is already there, and what needs a person to look.
 *
 * Nothing here guesses about people. A client is joined to an existing record
 * only on a matching email, or a matching name and postcode; a name alone is
 * flagged, never linked, so one family's case can never land on another's.
 */

import {
  CASE_IMPORT_DEFAULT_QUEUE,
  CASE_IMPORT_DEFAULT_STATUS,
  CASE_IMPORT_FIELDS,
  OWNER_QUEUE_VALUES,
  STATUS_VALUES,
  TEAM_VALUES,
  type CaseImportFieldDef,
  type CaseImportFieldId,
  type OwnerQueue,
  type Status,
  type Team,
} from './config';
import { isCivilDate } from './drafting';
import { isPlausibleEmail, normaliseEmail } from './staff';

// --- Input ---------------------------------------------------------------------

/** One field's manual matches: the value as written → what it means ('' = leave blank). */
export type CaseImportValueMap = Record<string, string>;

export interface CaseImportRequest {
  /** Every row's cells as text (dates as YYYY-MM-DD), header row excluded. */
  rows: string[][];
  /** The spreadsheet row number of rows[0], for messages ("row 2"). */
  firstRowNumber: number;
  /** For each column, the field it holds (null = not imported). */
  mapping: (CaseImportFieldId | null)[];
  /** Manual matches for values the system did not recognise. */
  valueMaps: Partial<Record<CaseImportFieldId, CaseImportValueMap>>;
}

/** What is already on the system, for matching and duplicate checks. */
export interface CaseImportContext {
  today: string;
  users: readonly { id: string; displayName: string; active: boolean }[];
  clients: readonly {
    id: string;
    fullName: string;
    email: string | null;
    postcode: string | null;
  }[];
  /** Children already linked to each client. */
  children: readonly { clientId: string; childId: string; fullName: string }[];
  /** Live cases, by who and when (the duplicate check). */
  cases: readonly {
    caseReference: string;
    clientName: string | null;
    childName: string | null;
    dateOfEnquiry: string;
  }[];
}

// --- Output --------------------------------------------------------------------

export type CaseImportOutcome = 'import' | 'duplicate' | 'problem';

export interface CaseImportIssue {
  level: 'problem' | 'warning';
  message: string;
}

/** Who a row's client (or child) is: a new record, one on the system, or one made by an earlier row. */
export type CaseImportPartyRef =
  | { kind: 'none' }
  | { kind: 'new'; key: string }
  | { kind: 'existing'; id: string };

/** Everything needed to create one case. */
export interface CaseImportPlan {
  client: CaseImportPartyRef;
  clientFields: {
    fullName: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    otherContact: string | null;
    streetAddress: string | null;
    city: string | null;
    county: string | null;
    postcode: string | null;
  } | null;
  child: CaseImportPartyRef;
  childFields: { fullName: string; dateOfBirth: string | null } | null;
  dateOfEnquiry: string;
  status: Status;
  ownerUserId: string | null;
  ownerQueue: OwnerQueue | null;
  shadowUserId: string | null;
  teams: Team[];
  originalQuery: string | null;
  methodOfEnquiry: string | null;
  currentWork: string | null;
  appealNumber: string | null;
  paymentCode: string | null;
  discountCode: string | null;
  invoiceStatusText: string | null;
  accountingNotes: string | null;
  note: { date: string; body: string } | null;
}

export interface CaseImportRow {
  rowNumber: number;
  outcome: CaseImportOutcome;
  /** As written in the spreadsheet. */
  raw: Partial<Record<CaseImportFieldId, string>>;
  /** As it will be imported, for showing. */
  shown: Partial<Record<CaseImportFieldId, string>>;
  issues: CaseImportIssue[];
  /** "New client", "Existing client", "Same client as row 4". */
  clientNote: string | null;
  plan: CaseImportPlan | null;
}

/** A value the system could not match by itself, for a person to match. */
export interface CaseImportValueToMatch {
  field: CaseImportFieldId;
  value: string;
  count: number;
  /** The manual match chosen so far ('' = leave blank), or null if none. */
  matchedTo: string | null;
}

export interface CaseImportAnalysis {
  rows: CaseImportRow[];
  valuesToMatch: CaseImportValueToMatch[];
  summary: {
    total: number;
    toImport: number;
    duplicates: number;
    problems: number;
    /** Rows to import that join a client already on the system. */
    existingClients: number;
    withWarnings: number;
  };
}

// --- Matching helpers ------------------------------------------------------------

/** Letters and digits only, lower case: "Section BF&I" and "Section B F & I" match. */
export function importKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fieldDef(id: CaseImportFieldId): CaseImportFieldDef {
  return CASE_IMPORT_FIELDS.find((f) => f.id === id)!;
}

/**
 * Match each spreadsheet heading to a field: the system's own heading, or one
 * of its alternatives, ignoring case, spacing and punctuation. Each field is
 * matched at most once (the first column wins); unknown headings are left
 * unmatched for a person to decide.
 */
export function matchImportHeadings(
  headings: readonly string[],
): (CaseImportFieldId | null)[] {
  const taken = new Set<string>();
  return headings.map((heading) => {
    const key = importKey(heading);
    if (!key) return null;
    const field = CASE_IMPORT_FIELDS.find(
      (f) =>
        !taken.has(f.id) &&
        [f.label, ...f.aliases].some((name) => importKey(name) === key),
    );
    if (!field) return null;
    taken.add(field.id);
    return field.id;
  });
}

/**
 * A UK date as written in a spreadsheet — 01/09/2026, 1/9/26, 01.09.2026,
 * 01-09-2026 — or an ISO date (how date cells arrive), as YYYY-MM-DD.
 */
export function parseImportDate(raw: string): string | null {
  const value = raw.trim();
  if (isCivilDate(value)) return value;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value);
  if (!m) return null;
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  const iso = `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isCivilDate(iso) ? iso : null;
}

/** A member of staff by full name, or by a first name only one person has. */
function matchUser(
  raw: string,
  users: CaseImportContext['users'],
): { id: string; displayName: string; active: boolean } | null {
  const key = importKey(raw);
  if (!key) return null;
  const full = users.filter((u) => importKey(u.displayName) === key);
  if (full.length === 1) return full[0]!;
  const first = users.filter(
    (u) => importKey(u.displayName.split(/\s+/)[0] ?? '') === key,
  );
  return first.length === 1 ? first[0]! : null;
}

function matchVocab(raw: string, values: readonly string[]): string | null {
  const key = importKey(raw);
  return values.find((v) => importKey(v) === key) ?? null;
}

/** The latest DD/MM/YYYY date written in a note that is not in the future. */
function latestDateIn(text: string, today: string): string | null {
  let latest: string | null = null;
  for (const m of text.matchAll(/\b(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\b/g)) {
    const iso = parseImportDate(m[1]!);
    if (iso && iso <= today && (!latest || iso > latest)) latest = iso;
  }
  return latest;
}

// --- Analysis --------------------------------------------------------------------

/**
 * Decide what each row of the case list becomes. Rows with a problem are not
 * imported; duplicates (already on the system, or repeated in the sheet) are
 * skipped, so running the same file twice never creates a case twice.
 */
export function analyseCaseImport(
  request: CaseImportRequest,
  context: CaseImportContext,
): CaseImportAnalysis {
  const { users } = context;
  const usersById = new Map(users.map((u) => [u.id, u]));
  const toMatch = new Map<string, CaseImportValueToMatch>();
  const noteToMatch = (field: CaseImportFieldId, value: string) => {
    const id = `${field}\u0000${value}`;
    const entry = toMatch.get(id);
    if (entry) entry.count += 1;
    else
      toMatch.set(id, {
        field,
        value,
        count: 1,
        matchedTo: request.valueMaps[field]?.[value] ?? null,
      });
  };
  /** A manual match for a value, if one was chosen ('' = leave blank). */
  const manual = (field: CaseImportFieldId, value: string) =>
    request.valueMaps[field]?.[value];

  // Clients and children made by earlier rows, by identity key.
  const newClients = new Map<string, number>();
  const seenCases = new Map<string, number>();
  const existingCases = new Map(
    context.cases.map((c) => [
      `${importKey(c.clientName ?? '')}|${importKey(c.childName ?? '')}|${c.dateOfEnquiry}`,
      c.caseReference,
    ]),
  );

  const rows: CaseImportRow[] = [];
  request.rows.forEach((cells, index) => {
    const rowNumber = request.firstRowNumber + index;
    // A blank row (in the columns being imported) is not a case.
    if (!request.mapping.some((field, col) => field && cells[col]?.trim()))
      return;
    const raw: Partial<Record<CaseImportFieldId, string>> = {};
    request.mapping.forEach((field, col) => {
      const value = (cells[col] ?? '').trim();
      if (field && value) raw[field] = value;
    });
    const shown: Partial<Record<CaseImportFieldId, string>> = {};
    const issues: CaseImportIssue[] = [];
    const problem = (message: string) =>
      issues.push({ level: 'problem', message });
    const warn = (message: string) =>
      issues.push({ level: 'warning', message });

    /** A vocabulary value: recognised, matched by hand, or flagged. */
    const vocab = (field: CaseImportFieldId): string | null => {
      const value = raw[field];
      if (!value) return null;
      const def = fieldDef(field);
      const auto = matchVocab(value, def.values ?? []);
      if (auto) {
        shown[field] = auto;
        return auto;
      }
      noteToMatch(field, value);
      const chosen = manual(field, value);
      if (chosen !== undefined) {
        const valid =
          chosen === '' ? null : matchVocab(chosen, def.values ?? []);
        if (valid) shown[field] = valid;
        return valid;
      }
      warn(
        `${def.label} “${value}” is not one of the system’s values, so it is left blank. Match it above to import it.`,
      );
      return null;
    };

    // Date of enquiry: required.
    const dateOfEnquiry = raw.dateOfEnquiry
      ? parseImportDate(raw.dateOfEnquiry)
      : null;
    if (!raw.dateOfEnquiry) problem('No date of enquiry.');
    else if (!dateOfEnquiry)
      problem(
        `Date of enquiry “${raw.dateOfEnquiry}” is not a date (use DD/MM/YYYY).`,
      );
    else shown.dateOfEnquiry = dateOfEnquiry;

    // Status: must be one of the system's — a blank status would be a guess.
    let status: Status = CASE_IMPORT_DEFAULT_STATUS;
    if (raw.status) {
      let value = matchVocab(raw.status, STATUS_VALUES) as Status | null;
      if (!value) {
        noteToMatch('status', raw.status);
        const chosen = manual('status', raw.status);
        value = chosen
          ? (matchVocab(chosen, STATUS_VALUES) as Status | null)
          : null;
        if (!value)
          problem(
            `Status “${raw.status}” is not one of the system’s statuses. Match it above.`,
          );
      }
      if (value) status = value;
    } else warn(`No status, so imported as ${status}.`);
    shown.status = status;

    // Owner: a person, or a queue.
    let ownerUserId: string | null = null;
    let ownerQueue: OwnerQueue | null = null;
    if (raw.allocatedTo) {
      const value = raw.allocatedTo;
      const queue = matchVocab(value, OWNER_QUEUE_VALUES) as OwnerQueue | null;
      const person = queue ? null : matchUser(value, users);
      const chosen = queue || person ? undefined : manual('allocatedTo', value);
      if (!queue && !person) noteToMatch('allocatedTo', value);
      if (queue) ownerQueue = queue;
      else if (person) ownerUserId = person.id;
      else if (chosen?.startsWith('user:') && usersById.has(chosen.slice(5)))
        ownerUserId = chosen.slice(5);
      else if (chosen?.startsWith('queue:')) {
        ownerQueue = matchVocab(
          chosen.slice(6),
          OWNER_QUEUE_VALUES,
        ) as OwnerQueue | null;
      }
      if (!ownerUserId && !ownerQueue) {
        ownerQueue = CASE_IMPORT_DEFAULT_QUEUE;
        if (chosen === undefined)
          warn(
            `“${value}” in Allocated to is not a member of staff or a queue, so the case goes to the ${ownerQueue} queue. Match it above.`,
          );
      }
    } else {
      ownerQueue = CASE_IMPORT_DEFAULT_QUEUE;
      warn(`No one allocated, so the case goes to the ${ownerQueue} queue.`);
    }
    if (ownerUserId) {
      const u = usersById.get(ownerUserId)!;
      shown.allocatedTo = u.displayName;
      if (!u.active && status !== 'Closed')
        warn(
          `${u.displayName} has left; consider allocating this open case to someone else after import.`,
        );
    } else shown.allocatedTo = ownerQueue!;

    // Dealing/shadow: a person or nobody.
    let shadowUserId: string | null = null;
    if (raw.dealingShadow) {
      const value = raw.dealingShadow;
      const person = matchUser(value, users);
      if (person) shadowUserId = person.id;
      else {
        noteToMatch('dealingShadow', value);
        const chosen = manual('dealingShadow', value);
        if (chosen && usersById.has(chosen)) shadowUserId = chosen;
        else if (chosen === undefined)
          warn(
            `Dealing/ Shadow “${value}” is not a member of staff, so it is left blank. Match it above.`,
          );
      }
      if (shadowUserId)
        shown.dealingShadow = usersById.get(shadowUserId)!.displayName;
    }

    // Teams: "TSA", "TSA / ISA", "TSA and ISA".
    const teams: Team[] = [];
    if (raw.team) {
      for (const part of raw.team.split(/\s*(?:[,/&+;]|\band\b)\s*/i)) {
        if (!part.trim()) continue;
        const auto = matchVocab(part, TEAM_VALUES) as Team | null;
        let team = auto;
        if (!auto) {
          noteToMatch('team', part.trim());
          const chosen = manual('team', part.trim());
          team = chosen
            ? (matchVocab(chosen, TEAM_VALUES) as Team | null)
            : null;
          if (chosen === undefined)
            warn(
              `Team “${part.trim()}” is not one of the system’s teams. Match it above.`,
            );
        }
        if (team && !teams.includes(team)) teams.push(team);
      }
      if (teams.length) shown.team = teams.join(', ');
    }

    const originalQuery = vocab('originalQuery');
    const methodOfEnquiry = vocab('methodOfEnquiry');
    const currentWork = vocab('currentWork');
    const paymentCode = vocab('paymentCode');
    const discountCode = vocab('discountCode');

    // Plain text fields, as written.
    const text = (field: CaseImportFieldId): string | null => {
      const value = raw[field] ?? null;
      if (value) shown[field] = value;
      return value;
    };
    const appealNumber = text('appealNumber');
    const invoiceStatusText = text('invoiceStatus');
    const accountingNotes = text('accountingNotes');

    // The client.
    const clientName = raw.clientName ?? null;
    let email: string | null = null;
    if (raw.email) {
      if (isPlausibleEmail(raw.email)) email = normaliseEmail(raw.email);
      else
        warn(
          `Email “${raw.email}” does not look like an email address, so it is left out.`,
        );
    }
    if (email) shown.email = email;
    const contact = {
      phone: text('phone'),
      mobile: text('mobile'),
      otherContact: text('otherContact'),
      streetAddress: text('streetAddress'),
      city: text('city'),
      county: text('county'),
      postcode: text('postcode'),
    };
    let client: CaseImportPartyRef = { kind: 'none' };
    let clientNote: string | null = null;
    if (clientName) {
      shown.clientName = clientName;
      const postKey = importKey(contact.postcode ?? '');
      const nameKey = importKey(clientName);
      const onSystem = context.clients.find(
        (c) =>
          (email && c.email && normaliseEmail(c.email) === email) ||
          (postKey &&
            importKey(c.fullName) === nameKey &&
            importKey(c.postcode ?? '') === postKey),
      );
      const key = email
        ? `e:${email}`
        : postKey
          ? `np:${nameKey}|${postKey}`
          : `row:${rowNumber}`;
      if (onSystem) {
        client = { kind: 'existing', id: onSystem.id };
        clientNote = `Existing client (${onSystem.fullName})`;
        if (importKey(onSystem.fullName) !== nameKey)
          warn(
            `Joined to the client ${onSystem.fullName}, who has the same email address. Check this is the same person.`,
          );
      } else {
        client = { kind: 'new', key };
        const earlier = newClients.get(key);
        clientNote =
          earlier !== undefined
            ? `Same new client as row ${earlier}`
            : 'New client';
        if (earlier === undefined) newClients.set(key, rowNumber);
        if (
          !email &&
          !postKey &&
          context.clients.some((c) => importKey(c.fullName) === nameKey)
        )
          warn(
            `A client called ${clientName} is already on the system. With no email or postcode to confirm it is the same person, a separate client record will be made.`,
          );
      }
    }

    // The child.
    const childName = raw.childName ?? null;
    const childDob = raw.childDateOfBirth
      ? parseImportDate(raw.childDateOfBirth)
      : null;
    if (raw.childDateOfBirth && !childDob)
      warn(
        `Child’s date of birth “${raw.childDateOfBirth}” is not a date, so it is left out.`,
      );
    if (childDob) shown.childDateOfBirth = childDob;
    let child: CaseImportPartyRef = { kind: 'none' };
    if (childName) {
      shown.childName = childName;
      const childKey = importKey(childName);
      const known =
        client.kind === 'existing'
          ? context.children.find(
              (c) =>
                c.clientId === client.id && importKey(c.fullName) === childKey,
            )
          : undefined;
      if (known) child = { kind: 'existing', id: known.childId };
      else {
        const key = `${client.kind === 'none' ? `row:${rowNumber}` : client.kind === 'new' ? client.key : `c:${client.id}`}|${childKey}`;
        child = { kind: 'new', key };
      }
    }
    if (!clientName && !childName)
      problem(
        'No client name or child’s name, so there is nobody to make the case for.',
      );

    // The notes column becomes a case note, dated by its latest entry.
    let note: CaseImportPlan['note'] = null;
    if (raw.notes) {
      shown.notes = raw.notes;
      note = {
        date:
          latestDateIn(raw.notes, context.today) ??
          dateOfEnquiry ??
          context.today,
        body: raw.notes,
      };
    }

    // Already on the system, or repeated in this sheet?
    let outcome: CaseImportOutcome = issues.some((i) => i.level === 'problem')
      ? 'problem'
      : 'import';
    if (outcome === 'import' && dateOfEnquiry) {
      const dupKey = `${importKey(clientName ?? '')}|${importKey(childName ?? '')}|${dateOfEnquiry}`;
      const existing = existingCases.get(dupKey);
      const earlier = seenCases.get(dupKey);
      if (existing) {
        outcome = 'duplicate';
        warn(`Already on the system as ${existing}, so it is skipped.`);
      } else if (earlier !== undefined) {
        outcome = 'duplicate';
        warn(`The same case as row ${earlier}, so it is skipped.`);
      } else seenCases.set(dupKey, rowNumber);
    }

    const plan: CaseImportPlan | null =
      outcome === 'import'
        ? {
            client,
            clientFields: clientName
              ? { fullName: clientName, email, ...contact }
              : null,
            child,
            childFields: childName
              ? { fullName: childName, dateOfBirth: childDob }
              : null,
            dateOfEnquiry: dateOfEnquiry!,
            status,
            ownerUserId,
            ownerQueue,
            shadowUserId,
            teams,
            originalQuery,
            methodOfEnquiry,
            currentWork,
            appealNumber,
            paymentCode,
            discountCode,
            invoiceStatusText,
            accountingNotes,
            note,
          }
        : null;

    rows.push({ rowNumber, outcome, raw, shown, issues, clientNote, plan });
  });

  const toImport = rows.filter((r) => r.outcome === 'import');
  return {
    rows,
    valuesToMatch: [...toMatch.values()].sort(
      (a, b) => a.field.localeCompare(b.field) || b.count - a.count,
    ),
    summary: {
      total: rows.length,
      toImport: toImport.length,
      duplicates: rows.filter((r) => r.outcome === 'duplicate').length,
      problems: rows.filter((r) => r.outcome === 'problem').length,
      existingClients: toImport.filter(
        (r) => r.plan?.client.kind === 'existing',
      ).length,
      withWarnings: toImport.filter((r) =>
        r.issues.some((i) => i.level === 'warning'),
      ).length,
    },
  };
}
