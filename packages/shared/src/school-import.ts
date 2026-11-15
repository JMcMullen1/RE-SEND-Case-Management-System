/**
 * school-import.ts — bringing schools in from the DfE's register, Get
 * Information About Schools (GIAS). Pure: the browser reads the file with
 * these, and the API plans the import against the directory with them.
 *
 * The file is a CSV of every establishment in England and Wales. Closed ones,
 * and ones the charity never deals with (abroad, universities, online-only,
 * Welsh unless on the Section 41 list), are left out. Each school becomes the
 * directory's own fields: funding and provision from its type, Section 41 from
 * its approval, the address as one line.
 */

import {
  GIAS_ALTERNATIVE_PROVISION_TYPES,
  GIAS_EXCLUDED_TYPES,
  GIAS_FUNDING_BY_GROUP,
  GIAS_FUNDING_BY_TYPE,
  GIAS_IMPORTED_STATUSES,
  GIAS_MAINSTREAM_GROUPS,
  GIAS_RESOURCE_BASE_VALUES,
  GIAS_SECTION_41_APPROVED,
  GIAS_SPECIALIST_TYPES,
  SCHOOL_AGE_MAX,
  SCHOOL_IMPORT_REFRESHED_FIELDS,
  type SchoolFunding,
  type SchoolProvision,
} from './config';
import {
  isValidUrn,
  normalisePostcode,
  normaliseUrn,
  schoolNameKey,
} from './schools';

/** One school as the DfE file describes it, in the directory's terms. */
export interface ImportedSchool {
  urn: string;
  name: string;
  address: string | null;
  postcode: string | null;
  localAuthority: string | null;
  phone: string | null;
  website: string | null;
  funding: SchoolFunding | null;
  provision: SchoolProvision | null;
  section41: boolean;
  ageFrom: number | null;
  ageTo: number | null;
}

export interface GiasFileContents {
  /** Open schools of the kinds the charity deals with. */
  schools: ImportedSchool[];
  /** Left out: closed, or not open yet. */
  closed: number;
  /** Left out: abroad, universities, online-only, Welsh. */
  outOfScope: number;
  /** Rows without a usable URN or name. */
  unreadable: number;
}

/** The columns read from the file. */
const COLUMNS = {
  urn: 'URN',
  name: 'EstablishmentName',
  la: 'LA (name)',
  type: 'TypeOfEstablishment (name)',
  group: 'EstablishmentTypeGroup (name)',
  status: 'EstablishmentStatus (name)',
  lowAge: 'StatutoryLowAge',
  highAge: 'StatutoryHighAge',
  street: 'Street',
  locality: 'Locality',
  address3: 'Address3',
  town: 'Town',
  county: 'County (name)',
  postcode: 'Postcode',
  website: 'SchoolWebsite',
  phone: 'TelephoneNum',
  section41: 'Section41Approved (name)',
  resourced: 'TypeOfResourcedProvision (name)',
} as const;
type Column = keyof typeof COLUMNS;

export class NotAGiasFile extends Error {}

/**
 * The file's bytes as text. GIAS files are Windows-1252 ("’" is byte 0x92),
 * but a re-saved copy may be UTF-8: UTF-8 is tried first, strictly.
 */
export function decodeGiasBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = fromWindows1252(new TextDecoder('windows-1252').decode(bytes));
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Windows-1252's characters for bytes 0x80–0x9F (where it differs from Latin-1). */
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/**
 * Some runtimes (Node before 22) decode "windows-1252" as Latin-1, leaving
 * bytes 0x80–0x9F as control characters: map them to Windows-1252's own
 * ("’" for 0x92). Where the decoder was right, there are none to map.
 */
function fromWindows1252(text: string): string {
  return text.replace(/[\u0080-\u009f]/g, (c) =>
    String.fromCharCode(CP1252_HIGH[c.charCodeAt(0) - 0x80]!),
  );
}

/**
 * Read CSV text row by row (RFC 4180: quoted fields, doubled quotes, line
 * breaks inside quotes), handing each row to `onRow`. Row by row, so a 65 MB
 * file is never held as one big table.
 */
export function readCsvRows(
  text: string,
  onRow: (cells: string[]) => void,
): void {
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (c === 34 /* " */) {
        if (text.charCodeAt(i + 1) === 34) {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      // Copy a run of ordinary characters at once.
      let j = i;
      while (j < n && text.charCodeAt(j) !== 34) j++;
      field += text.slice(i, j);
      i = j;
      continue;
    }
    if (c === 34) {
      quoted = true;
      i++;
    } else if (c === 44 /* , */) {
      row.push(field);
      field = '';
      i++;
    } else if (c === 10 || c === 13) {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') onRow(row);
      row = [];
      i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
    } else {
      let j = i;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === 34 || d === 44 || d === 10 || d === 13) break;
        j++;
      }
      field += text.slice(i, j);
      i = j;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    onRow(row);
  }
}

function age(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  // FE colleges give 99 ("no upper limit"): shown as "Ages 16+".
  return n <= SCHOOL_AGE_MAX ? n : null;
}

function orNull(s: string): string | null {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t : null;
}

/** A school's provision from its GIAS type and resourced provision. */
export function giasProvision(
  type: string,
  group: string,
  resourced: string,
): SchoolProvision | null {
  if ((GIAS_SPECIALIST_TYPES as readonly string[]).includes(type))
    return 'specialist';
  if ((GIAS_ALTERNATIVE_PROVISION_TYPES as readonly string[]).includes(type))
    return 'alternative_provision';
  if ((GIAS_RESOURCE_BASE_VALUES as readonly string[]).includes(resourced))
    return 'mainstream_resource_base';
  if ((GIAS_MAINSTREAM_GROUPS as readonly string[]).includes(group))
    return 'mainstream';
  return null;
}

/** A school's funding from its GIAS type, then its type group. */
export function giasFunding(type: string, group: string): SchoolFunding | null {
  return GIAS_FUNDING_BY_TYPE[type] ?? GIAS_FUNDING_BY_GROUP[group] ?? null;
}

/**
 * The schools in a GIAS "all establishment data" file. Throws NotAGiasFile if
 * the columns it needs are missing (a different file chosen by mistake).
 */
export function readGiasFile(text: string): GiasFileContents {
  const out: GiasFileContents = {
    schools: [],
    closed: 0,
    outOfScope: 0,
    unreadable: 0,
  };
  let index: Record<Column, number> | null = null;
  const statuses = GIAS_IMPORTED_STATUSES as readonly string[];
  const excluded = GIAS_EXCLUDED_TYPES as readonly string[];
  readCsvRows(text, (cells) => {
    if (!index) {
      const found = {} as Record<Column, number>;
      const missing: string[] = [];
      for (const [key, heading] of Object.entries(COLUMNS) as [
        Column,
        string,
      ][]) {
        const at = cells.findIndex((c) => c.trim() === heading);
        if (at < 0) missing.push(heading);
        found[key] = at;
      }
      if (missing.length)
        throw new NotAGiasFile(
          `This isn't the DfE's establishment file: it has no ${missing
            .slice(0, 3)
            .map((m) => `“${m}”`)
            .join(', ')} column${missing.length > 1 ? 's' : ''}.`,
        );
      index = found;
      return;
    }
    const get = (k: Column) => cells[index![k]] ?? '';
    if (!statuses.includes(get('status').trim())) {
      out.closed++;
      return;
    }
    const type = get('type').trim();
    const section41 = get('section41').trim() === GIAS_SECTION_41_APPROVED;
    if (excluded.includes(type) && !section41) {
      out.outOfScope++;
      return;
    }
    const urn = normaliseUrn(get('urn'));
    const name = orNull(get('name'));
    if (!urn || !isValidUrn(urn) || !name) {
      out.unreadable++;
      return;
    }
    const group = get('group').trim();
    let ageFrom = age(get('lowAge'));
    let ageTo = age(get('highAge'));
    if (ageFrom !== null && ageTo !== null && ageFrom > ageTo) {
      ageFrom = null;
      ageTo = null;
    }
    const address = [
      get('street'),
      get('locality'),
      get('address3'),
      get('town'),
      get('county'),
    ]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(', ');
    out.schools.push({
      urn,
      name,
      address: orNull(address),
      postcode: normalisePostcode(get('postcode')),
      localAuthority: orNull(get('la')),
      phone: orNull(get('phone')),
      website: orNull(get('website')),
      funding: giasFunding(type, group),
      provision: giasProvision(type, group, get('resourced').trim()),
      section41,
      ageFrom,
      ageTo,
    });
  });
  if (!index) throw new NotAGiasFile('The file is empty.');
  return out;
}

/** The local authorities in a set of schools, A–Z, with how many each has. */
export function localAuthorityCounts(
  schools: readonly ImportedSchool[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of schools) {
    const la = s.localAuthority ?? 'Not recorded';
    counts.set(la, (counts.get(la) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- Planning an import against the directory --------------------------------

/** A school already in the directory, as the plan compares it. */
export interface ExistingSchool {
  id: string;
  urn: string | null;
  name: string;
  address: string | null;
  postcode: string | null;
  localAuthority: string | null;
  phone: string | null;
  website: string | null;
  funding: SchoolFunding | null;
  provision: SchoolProvision | null;
  section41: boolean;
  ageFrom: number | null;
  ageTo: number | null;
  archived: boolean;
}

type RefreshedField = (typeof SCHOOL_IMPORT_REFRESHED_FIELDS)[number];
type ChangedField = RefreshedField | 'provision' | 'urn';
export type SchoolImportChanges = Partial<
  Record<ChangedField, { from: unknown; to: unknown }>
>;

export interface SchoolImportUpdate {
  id: string;
  urn: string;
  /** The name as it will be (the DfE's). */
  name: string;
  /** Found by URN, or by name and postcode for a school added without one. */
  matchedBy: 'urn' | 'name';
  archived: boolean;
  changes: SchoolImportChanges;
}

export interface SchoolImportPlan {
  create: ImportedSchool[];
  update: SchoolImportUpdate[];
  /** In the directory already, nothing to change. */
  unchanged: number;
  /** The same URN more than once in what was sent: later ones ignored. */
  repeated: number;
}

/**
 * What importing `incoming` would do to the directory. A school with the same
 * URN is the same school (archived ones too: their facts are refreshed, but
 * they stay archived). A school added by hand without a URN is the same school
 * when exactly one live school has the same name (as schoolNameKey compares
 * names) and the same postcode, or no postcode, and no other school in the
 * file has that name; it gains the URN. Anything else is new.
 */
export function planSchoolImport(
  incoming: readonly ImportedSchool[],
  existing: readonly ExistingSchool[],
): SchoolImportPlan {
  const byUrn = new Map<string, ExistingSchool>();
  const withoutUrn = new Map<string, ExistingSchool[]>();
  for (const e of existing) {
    if (e.urn) {
      // A live school wins over an archived one with the same URN.
      const had = byUrn.get(e.urn);
      if (!had || (had.archived && !e.archived)) byUrn.set(e.urn, e);
    } else if (!e.archived) {
      // Only live schools are recognised by name: an archived copy given the
      // URN would keep the school out of the directory for good.
      const key = schoolNameKey(e.name);
      withoutUrn.set(key, [...(withoutUrn.get(key) ?? []), e]);
    }
  }
  // Names the file itself uses more than once (an academy and the school it
  // replaced; "St Mary's" in two towns) are never matched by name.
  const namesInFile = new Map<string, number>();
  for (const s of incoming) {
    const key = schoolNameKey(s.name);
    namesInFile.set(key, (namesInFile.get(key) ?? 0) + 1);
  }

  const plan: SchoolImportPlan = {
    create: [],
    update: [],
    unchanged: 0,
    repeated: 0,
  };
  const seen = new Set<string>();
  const claimed = new Set<string>();
  for (const school of incoming) {
    if (seen.has(school.urn)) {
      plan.repeated++;
      continue;
    }
    seen.add(school.urn);

    let match = byUrn.get(school.urn);
    let matchedBy: 'urn' | 'name' = 'urn';
    const nameKey = schoolNameKey(school.name);
    if (!match && namesInFile.get(nameKey) === 1) {
      const postcode = school.postcode;
      const candidates = (withoutUrn.get(nameKey) ?? [])
        .filter((e) => !claimed.has(e.id))
        .filter((e) => !e.postcode || !postcode || e.postcode === postcode);
      if (candidates.length === 1) {
        match = candidates[0]!;
        matchedBy = 'name';
        claimed.add(match.id);
      }
    }
    if (!match) {
      plan.create.push(school);
      continue;
    }

    const changes: SchoolImportChanges = {};
    if (matchedBy === 'name') changes.urn = { from: null, to: school.urn };
    for (const field of SCHOOL_IMPORT_REFRESHED_FIELDS) {
      const to = school[field];
      const from = match[field];
      // An empty value in the file never blanks what the directory holds.
      if (to === null || to === undefined) continue;
      if (to !== from) changes[field] = { from, to };
    }
    if (match.provision === null && school.provision !== null)
      changes.provision = { from: null, to: school.provision };

    if (Object.keys(changes).length === 0) plan.unchanged++;
    else
      plan.update.push({
        id: match.id,
        urn: school.urn,
        name: school.name,
        matchedBy,
        archived: match.archived,
        changes,
      });
  }
  return plan;
}

/** What an import would do, as the admin reviews it before importing. */
export interface SchoolImportPreview {
  toCreate: number;
  toUpdate: number;
  unchanged: number;
  repeated: number;
  /** Schools added by hand, recognised by name and postcode. */
  matchedByName: SchoolImportUpdate[];
  /** Other schools whose facts change (the first few hundred). */
  updates: SchoolImportUpdate[];
}

export interface SchoolImportResult {
  batchId: string;
  created: number;
  updated: number;
  unchanged: number;
}
