import type {
  EnquiryMethod,
  KeyDateType,
  OwnerQueue,
  QueryType,
  Status,
  Team,
  UserRole,
  WorkType,
} from '@re-send/shared';

/**
 * Fictional development data. No real people, no real schools. These fixtures
 * exist so the case list, timeline and calendar can be built and tested; they
 * are not demo data and not a migration path.
 */

export interface StaffSpec {
  displayName: string;
  email: string;
  role: UserRole;
}

// Fictional staff. Owners are drawn from the caseworkers and the admin.
export const STAFF: StaffSpec[] = [
  {
    displayName: 'Priya Nair',
    email: 'priya.nair@resend.example',
    role: 'caseworker',
  },
  {
    displayName: 'Tom Blackwood',
    email: 'tom.blackwood@resend.example',
    role: 'caseworker',
  },
  {
    displayName: 'Grace Okafor',
    email: 'grace.okafor@resend.example',
    role: 'admin',
  },
  {
    displayName: 'Liam Frost',
    email: 'liam.frost@resend.example',
    role: 'finance',
  },
  {
    displayName: 'Nadia Rahman',
    email: 'nadia.rahman@resend.example',
    role: 'read_only',
  },
  {
    displayName: 'Owen Meadows',
    email: 'owen.meadows@resend.example',
    role: 'caseworker',
  },
];

export const PARENT_FIRST_NAMES = [
  'Amara',
  'Ben',
  'Carys',
  'Dario',
  'Elin',
  'Farrah',
  'Gethin',
  'Halima',
  'Isaac',
  'Jodie',
  'Kwame',
  'Lena',
  'Marcus',
  'Nia',
  'Oscar',
  'Petra',
  'Rhys',
  'Saoirse',
  'Tariq',
  'Uma',
];

export const PARENT_SURNAMES = [
  'Abernathy',
  'Bexley',
  'Calloway',
  'Denholm',
  'Everly',
  'Fairbanks',
  'Gillespie',
  'Harlow',
  'Ingram',
  'Jessop',
  'Kingsley',
  'Lindqvist',
  'Marsden',
  'Northcott',
  'Ollerenshaw',
  'Pemberton',
  'Quraishi',
  'Rosenthal',
  'Sandoval',
  'Trevelyan',
];

export const CHILD_NAMES: { full: string; preferred: string }[] = [
  { full: 'Ada', preferred: 'Ada' },
  { full: 'Bowen', preferred: 'Bo' },
  { full: 'Cleo', preferred: 'Cleo' },
  { full: 'Devraj', preferred: 'Dev' },
  { full: 'Esme', preferred: 'Es' },
  { full: 'Finlay', preferred: 'Finn' },
  { full: 'Giana', preferred: 'Gia' },
  { full: 'Harit', preferred: 'Hari' },
  { full: 'Imogen', preferred: 'Immy' },
  { full: 'Jonah', preferred: 'Jonah' },
  { full: 'Kitra', preferred: 'Kit' },
  { full: 'Lucian', preferred: 'Lux' },
  { full: 'Milo', preferred: 'Milo' },
  { full: 'Noorah', preferred: 'Noor' },
  { full: 'Otto', preferred: 'Otto' },
  { full: 'Piadora', preferred: 'Pia' },
  { full: 'Rezwan', preferred: 'Rez' },
  { full: 'Sukhraj', preferred: 'Suki' },
  { full: 'Theodore', preferred: 'Theo' },
  { full: 'Verity', preferred: 'Vera' },
];

export const SCHOOLS = [
  'Harborview Primary School',
  'Kestrel Lane Academy',
  'Thornbury Community School',
  'Maple Hollow Primary',
  'Riverside Fields Academy',
  'Oakenshaw High School',
  'Bramblewood Primary',
  'Silvermoor Academy',
  'Fenwick Green School',
  'Larchfield Primary',
];

export const SEND_NEEDS = [
  'Autism spectrum condition; needs a structured, low-arousal environment.',
  'ADHD alongside specific learning difficulties in reading.',
  'Speech, language and communication needs.',
  'Sensory processing differences affecting the school day.',
  'Anxiety with a history of emotionally based school avoidance.',
  'Global developmental delay; working well below age-related expectations.',
  'Hearing impairment requiring radio-aid support.',
  'Physical disability; requires accessible access and moving-and-handling plan.',
];

export const NOTE_BODIES = [
  'Reviewed the draft EHCP and logged gaps in the Section F provision.',
  'Called the family to talk through the annual review timeline.',
  'Drafted a response to the local authority consultation.',
  'Prepared the appeal bundle and index for the hearing.',
  'Chased the local authority for the amended plan.',
  'Attended mediation; no agreement reached, appeal to continue.',
  'Received the expert report and shared a summary with the family.',
  'Lodged the appeal with the SEND Tribunal.',
  'Updated the working document with the family’s comments.',
  'Advised on personal budget and direct payment options.',
  'Read the LA case statement and noted points to challenge.',
  'Agreed next steps and set a follow-up date with the family.',
  'Requested provision costings from the proposed placement.',
  'Summarised the phase-transfer position for the file.',
  'Logged a safeguarding-adjacent concern to the caseworker.',
];

const KEY_DATE_TITLES: Record<KeyDateType, string> = {
  hearing: 'Tribunal hearing',
  evidence_deadline: 'Evidence deadline',
  annual_review: 'Annual review meeting',
  working_document: 'Working document exchange',
  mediation: 'Mediation session',
  consultation: 'School consultation response due',
  other: 'Case milestone',
};

export function keyDateTitle(type: KeyDateType): string {
  return KEY_DATE_TITLES[type];
}

export interface KeyDateSpec {
  offsetDays: number;
  type: KeyDateType;
  withTime?: boolean;
  superseded?: boolean;
  fromDocument?: boolean;
}

export type OwnerSpec =
  { kind: 'user'; staff: number } | { kind: 'queue'; queue: OwnerQueue };

export interface CaseSpec {
  status: Status;
  owner: OwnerSpec;
  teams: Team[];
  originalQuery: QueryType;
  currentWork: WorkType;
  methodOfEnquiry: EnquiryMethod;
  keyDates: KeyDateSpec[];
  notesCount: number;
  review?: boolean;
  document?: boolean;
}

const kd = (
  offsetDays: number,
  type: KeyDateType,
  extra: Partial<KeyDateSpec> = {},
): KeyDateSpec => ({ offsetDays, type, ...extra });

/**
 * Twenty cases covering the shapes the case list has to handle: every status,
 * both teams (with a couple sitting in both), a mix of named owners and queue
 * ownership, key dates from a few days overdue to months ahead, cases with no
 * key date, cases with several key dates on the same day, and a few cases with
 * a dozen or more notes.
 */
export const CASE_SPECS: CaseSpec[] = [
  {
    status: 'Active',
    owner: { kind: 'user', staff: 0 },
    teams: ['TSA'],
    originalQuery: 'Appeal - Section',
    currentWork: 'Section Appeal',
    methodOfEnquiry: 'Phone',
    keyDates: [
      kd(-3, 'evidence_deadline', { fromDocument: true }),
      kd(21, 'hearing'),
      kd(90, 'annual_review'),
    ],
    notesCount: 3,
    document: true,
  },
  {
    status: 'Enquiry',
    owner: { kind: 'queue', queue: 'Enquiries' },
    teams: ['ISA'],
    originalQuery: 'New Application',
    currentWork: 'Other',
    methodOfEnquiry: 'Query Form',
    keyDates: [],
    notesCount: 1,
  },
  {
    status: 'Allocation',
    owner: { kind: 'queue', queue: 'TSA Team' },
    teams: ['TSA'],
    originalQuery: 'Review Draft Plan',
    currentWork: 'Draft Review',
    methodOfEnquiry: 'Email - Enquiries',
    keyDates: [kd(30, 'working_document')],
    notesCount: 2,
  },
  {
    status: 'Payment/Billing',
    owner: { kind: 'user', staff: 1 },
    teams: ['ISA'],
    originalQuery: 'Appeal - Assess',
    currentWork: 'Section Appeal',
    methodOfEnquiry: 'Referral',
    keyDates: [kd(14, 'mediation')],
    notesCount: 14,
    review: true,
  },
  {
    status: 'Dormant',
    owner: { kind: 'user', staff: 2 },
    teams: ['TSA', 'ISA'],
    originalQuery: 'General Query',
    currentWork: 'Other',
    methodOfEnquiry: 'Email - Admin',
    keyDates: [kd(-10, 'hearing')],
    notesCount: 2,
    review: true,
  },
  {
    status: 'Closed',
    owner: { kind: 'user', staff: 0 },
    teams: ['ISA'],
    originalQuery: 'Annual Review',
    currentWork: 'Annual Review',
    methodOfEnquiry: 'Phone',
    keyDates: [kd(-60, 'hearing'), kd(-30, 'annual_review')],
    notesCount: 13,
    review: true,
  },
  {
    status: 'Active',
    owner: { kind: 'user', staff: 5 },
    teams: ['TSA'],
    originalQuery: 'Appeal - Section',
    currentWork: 'Section Appeal',
    methodOfEnquiry: 'Website',
    keyDates: [
      kd(21, 'hearing', { withTime: true }),
      kd(21, 'evidence_deadline', { withTime: true }),
      kd(21, 'working_document'),
    ],
    notesCount: 4,
  },
  {
    status: 'Active',
    owner: { kind: 'queue', queue: 'TSA Team' },
    teams: ['TSA'],
    originalQuery: 'Draft Review',
    currentWork: 'Draft Review',
    methodOfEnquiry: 'Email - Other',
    keyDates: [kd(5, 'consultation'), kd(45, 'hearing')],
    notesCount: 2,
  },
  {
    status: 'Enquiry',
    owner: { kind: 'queue', queue: 'Enquiries' },
    teams: ['ISA'],
    originalQuery: 'DLA',
    currentWork: 'DLA',
    methodOfEnquiry: 'Facebook',
    keyDates: [kd(120, 'annual_review')],
    notesCount: 1,
  },
  {
    status: 'Allocation',
    owner: { kind: 'user', staff: 1 },
    teams: ['TSA'],
    originalQuery: 'Appeal - Issue',
    currentWork: 'Section Appeal',
    methodOfEnquiry: 'Phone',
    keyDates: [
      kd(7, 'evidence_deadline', { superseded: true }),
      kd(60, 'hearing'),
    ],
    notesCount: 12,
  },
  {
    status: 'Active',
    owner: { kind: 'user', staff: 0 },
    teams: ['ISA'],
    originalQuery: 'PIP',
    currentWork: 'RTA',
    methodOfEnquiry: 'Face to Face',
    keyDates: [kd(-1, 'evidence_deadline'), kd(2, 'hearing')],
    notesCount: 5,
  },
  {
    status: 'Dormant',
    owner: { kind: 'user', staff: 2 },
    teams: ['TSA'],
    originalQuery: 'General Query',
    currentWork: 'Other',
    methodOfEnquiry: 'Email - Other',
    keyDates: [],
    notesCount: 2,
  },
  {
    status: 'Active',
    owner: { kind: 'user', staff: 5 },
    teams: ['ISA'],
    originalQuery: 'Annual Review',
    currentWork: 'Annual Review',
    methodOfEnquiry: 'Email - Enquiries',
    keyDates: [kd(180, 'annual_review')],
    notesCount: 3,
  },
  {
    status: 'Payment/Billing',
    owner: { kind: 'user', staff: 1 },
    teams: ['TSA'],
    originalQuery: 'Appeal - Section',
    currentWork: 'CAP',
    methodOfEnquiry: 'Referral',
    keyDates: [kd(9, 'mediation')],
    notesCount: 2,
    review: true,
  },
  {
    status: 'Closed',
    owner: { kind: 'user', staff: 0 },
    teams: ['ISA'],
    originalQuery: 'Appeal - Section',
    currentWork: 'Section Appeal',
    methodOfEnquiry: 'Phone',
    keyDates: [kd(-200, 'hearing')],
    notesCount: 6,
    review: true,
  },
  {
    status: 'Active',
    owner: { kind: 'queue', queue: 'TSA Team' },
    teams: ['TSA', 'ISA'],
    originalQuery: 'Review Draft Plan',
    currentWork: 'Section B F & I',
    methodOfEnquiry: 'Website',
    keyDates: [kd(3, 'evidence_deadline'), kd(3, 'working_document')],
    notesCount: 3,
  },
  {
    status: 'Enquiry',
    owner: { kind: 'queue', queue: 'Enquiries' },
    teams: ['ISA'],
    originalQuery: 'Other',
    currentWork: 'Other',
    methodOfEnquiry: 'Other',
    keyDates: [kd(14, 'other')],
    notesCount: 1,
  },
  {
    status: 'Allocation',
    owner: { kind: 'user', staff: 2 },
    teams: ['TSA'],
    originalQuery: 'Appeal - Section',
    currentWork: 'Section Appeal',
    methodOfEnquiry: 'Email - Enquiries',
    keyDates: [
      kd(30, 'hearing'),
      kd(31, 'evidence_deadline'),
      kd(75, 'annual_review'),
    ],
    notesCount: 15,
  },
  {
    status: 'Active',
    owner: { kind: 'user', staff: 5 },
    teams: ['ISA'],
    originalQuery: 'Draft Review',
    currentWork: 'Draft Review',
    methodOfEnquiry: 'Phone',
    keyDates: [kd(-5, 'consultation'), kd(50, 'hearing')],
    notesCount: 4,
  },
  {
    status: 'Dormant',
    owner: { kind: 'user', staff: 1 },
    teams: ['TSA'],
    originalQuery: 'General Query',
    currentWork: 'Personal Budget',
    methodOfEnquiry: 'Email - Admin',
    keyDates: [kd(100, 'annual_review')],
    notesCount: 2,
  },
];
