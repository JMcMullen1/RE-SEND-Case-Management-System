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
  CASE_IMPORT_NOTE_HEADING,
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
    clientId: string | null;
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
export function parseImportDate(raw: string, today?: string): string | null {
  const value = raw.trim();
  if (isCivilDate(value)) return value;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value);
  if (!m) return null;
  // A two-digit year is this century up to this year, else the last (98 → 1998).
  const thisYear = Number((today ?? new Date().toISOString()).slice(2, 4));
  const year =
    m[3]!.length === 2
      ? `${Number(m[3]) <= thisYear ? '20' : '19'}${m[3]}`
      : m[3]!;
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
    const iso = parseImportDate(m[1]!, today);
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

  // What is on the system, indexed once (a list can have thousands of rows).
  type Known = CaseImportContext['clients'][number];
  const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  const byEmail = new Map<string, Known[]>();
  const byNamePostcode = new Map<string, Known[]>();
  const knownNames = new Set<string>();
  for (const c of context.clients) {
    const nameKey = importKey(c.fullName);
    knownNames.add(nameKey);
    if (c.email) push(byEmail, normaliseEmail(c.email), c);
    if (c.postcode)
      push(byNamePostcode, `${nameKey}|${importKey(c.postcode)}`, c);
  }
  const childrenOf = new Map<string, Map<string, string>>();
  for (const c of context.children) {
    let kids = childrenOf.get(c.clientId);
    if (!kids) childrenOf.set(c.clientId, (kids = new Map()));
    kids.set(importKey(c.fullName), c.childId);
  }
  // A case is the same case when it is for the same client and child, on the
  // same date of enquiry — the client as resolved, not as spelled in the sheet.
  const existingCases = new Map(
    context.cases.map((c) => [
      `${c.clientId ?? 'none'}|${importKey(c.childName ?? '')}|${c.dateOfEnquiry}`,
      c.caseReference,
    ]),
  );
  // New clients made by earlier rows, by identity key.
  const newClients = new Map<string, { rowNumber: number; name: string }>();
  const seenCases = new Map<string, number>();

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
      ? parseImportDate(raw.dateOfEnquiry, context.today)
      : null;
    if (!raw.dateOfEnquiry) problem('No date of enquiry.');
    else if (dateOfEnquiry && dateOfEnquiry > context.today)
      problem(
        `Date of enquiry “${raw.dateOfEnquiry}” is in the future. Check it in the sheet.`,
      );
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
      const sameName = (c: Known) => importKey(c.fullName) === nameKey;
      let onSystem: Known | null = null;
      let emailConflict = false;
      // 1. An email names one family: the same email must be the same name.
      const byThisEmail = email ? (byEmail.get(email) ?? []) : [];
      if (byThisEmail.length > 0) {
        onSystem = byThisEmail.find(sameName) ?? null;
        emailConflict = !onSystem;
        if (emailConflict)
          problem(
            `The email ${email} belongs to ${byThisEmail[0]!.fullName} on the system, but this row names ${clientName}. One email address cannot be two people’s (a school’s or a professional’s, say): correct the name or the email in the sheet.`,
          );
      } else if (postKey) {
        // 2. Name and postcode — unless both sides have different emails.
        const candidates = byNamePostcode.get(`${nameKey}|${postKey}`) ?? [];
        const compatible = candidates.filter((c) => !email || !c.email);
        if (compatible.length === 1) onSystem = compatible[0]!;
        else if (candidates.length > 0)
          warn(
            `A client called ${clientName} with this postcode is already on the system${email ? ' with a different email' : ' more than once'}, so a separate client record will be made. Check whether it is the same person.`,
          );
      }
      if (onSystem) {
        client = { kind: 'existing', id: onSystem.id };
        clientNote = `Existing client (${onSystem.fullName})`;
      } else if (!emailConflict) {
        const key = email
          ? `e:${email}`
          : postKey
            ? `np:${nameKey}|${postKey}`
            : `row:${rowNumber}`;
        const earlier = newClients.get(key);
        if (earlier && importKey(earlier.name) !== nameKey)
          problem(
            `Row ${earlier.rowNumber} gives the same email (${email}) for ${earlier.name}. One email address cannot be two people’s: correct the name or the email in the sheet.`,
          );
        else {
          client = { kind: 'new', key };
          clientNote = earlier
            ? `Same new client as row ${earlier.rowNumber}`
            : 'New client';
          if (!earlier) newClients.set(key, { rowNumber, name: clientName });
        }
        if (!email && !postKey && knownNames.has(nameKey))
          warn(
            `A client called ${clientName} is already on the system. With no email or postcode to confirm it is the same person, a separate client record will be made.`,
          );
      }
    }

    // The child.
    const childName = raw.childName ?? null;
    let childDob = raw.childDateOfBirth
      ? parseImportDate(raw.childDateOfBirth, context.today)
      : null;
    if (childDob && childDob > context.today) {
      warn(
        `Child’s date of birth “${raw.childDateOfBirth}” is in the future, so it is left out.`,
      );
      childDob = null;
    } else if (raw.childDateOfBirth && !childDob)
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
          ? childrenOf.get(client.id)?.get(childKey)
          : undefined;
      if (known) child = { kind: 'existing', id: known };
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
        body: `${CASE_IMPORT_NOTE_HEADING}\n${raw.notes}`,
      };
    }

    // Already on the system, or repeated in this sheet?
    let outcome: CaseImportOutcome = issues.some((i) => i.level === 'problem')
      ? 'problem'
      : 'import';
    if (outcome === 'import' && dateOfEnquiry) {
      const clientRef =
        client.kind === 'existing'
          ? client.id
          : client.kind === 'new'
            ? `new:${client.key}`
            : 'none';
      const dupKey = `${clientRef}|${importKey(childName ?? '')}|${dateOfEnquiry}`;
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
