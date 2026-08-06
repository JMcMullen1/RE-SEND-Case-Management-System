import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { TEAM_VALUES } from '@re-send/shared';
import { env } from '../env';
import * as schema from '../db/schema';
import {
  assertSafeToMutate,
  FixtureRefusal,
  truncateAll,
  writeMarker,
} from './safety';
import {
  CASE_SPECS,
  CHILD_NAMES,
  keyDateTitle,
  NOTE_BODIES,
  PARENT_FIRST_NAMES,
  PARENT_SURNAMES,
  SCHOOLS,
  SEND_NEEDS,
  STAFF,
} from './data';

const {
  cases,
  caseNotes,
  caseReviews,
  caseTeams,
  children,
  clientChildren,
  clients,
  documents,
  keyDates,
  teams,
  users,
} = schema;

const MS_PER_DAY = 86_400_000;
const BASE = new Date();

function dateObj(offsetDays: number): Date {
  return new Date(BASE.getTime() + offsetDays * MS_PER_DAY);
}

function dateStr(offsetDays: number): string {
  return dateObj(offsetDays).toISOString().slice(0, 10);
}

const YEAR = BASE.getUTCFullYear();
const SCHOOL_YEARS = [
  'Reception',
  'Yr1',
  'Yr3',
  'Yr5',
  'Yr6',
  'Yr8',
  'Yr9',
  'Yr11',
  'Yr12',
  'Post19',
] as const;

// Small deterministic PRNG so runs are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

async function main(): Promise<void> {
  const sql = postgres(env.DATABASE_URL as string, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    // The guard guarantees the database holds no foreign data. Start from a
    // clean slate every time — this clears the migration-seeded teams (which
    // the loader re-seeds) and makes a reload fully repeatable.
    await assertSafeToMutate(sql);
    await truncateAll(sql);

    await db.transaction(async (tx) => {
      // Standing teams (self-sufficient: works even after a clear wiped them).
      const teamRows = await tx
        .insert(teams)
        .values(TEAM_VALUES.map((code) => ({ code, name: code })))
        .returning({ id: teams.id, code: teams.code });
      const teamId = new Map(teamRows.map((t) => [t.code, t.id]));

      const staffRows = await tx
        .insert(users)
        .values(STAFF.map((s) => ({ ...s })))
        .returning({ id: users.id });

      const createdClientIds: string[] = [];
      const createdChildIds: string[] = [];

      for (let i = 0; i < CASE_SPECS.length; i += 1) {
        const spec = CASE_SPECS[i]!;
        const rng = mulberry32(i + 1);

        const first = PARENT_FIRST_NAMES[i % PARENT_FIRST_NAMES.length]!;
        const surname = PARENT_SURNAMES[i % PARENT_SURNAMES.length]!;
        const child = CHILD_NAMES[i % CHILD_NAMES.length]!;

        const [client] = await tx
          .insert(clients)
          .values({
            fullName: `${first} ${surname}`,
            displayName: `${surname}, ${first}`,
            preferredName: first,
            email: `${first}.${surname}@example.invalid`.toLowerCase(),
            phone: `01632 ${String(960000 + i).slice(0, 6)}`,
            mobile: `07700 ${String(900000 + i).slice(0, 6)}`,
            city: 'Fictionton',
            county: 'Exampleshire',
            postcode: `EX${(i % 9) + 1} ${(i % 9) + 1}FX`,
            additionalNeeds: SEND_NEEDS[i % SEND_NEEDS.length]!,
            consentDataProcessing: true,
            consentDataProcessingAt: BASE,
            consentPrivacyNotice: true,
            consentPrivacyNoticeAt: BASE,
            paymentPlanRequired: i % 5 === 0,
          })
          .returning({ id: clients.id });

        const [childRow] = await tx
          .insert(children)
          .values({
            fullName: `${child.full} ${surname}`,
            preferredName: child.preferred,
            dateOfBirth: dateStr(-(2200 + i * 40)),
            schoolYear: SCHOOL_YEARS[i % SCHOOL_YEARS.length]!,
            currentSchoolName: SCHOOLS[i % SCHOOLS.length]!,
            currentSchoolAddress: `${10 + i} Invented Road, Fictionton, EX${(i % 9) + 1} ${(i % 9) + 1}FX`,
            desiredSchool: SCHOOLS[(i + 3) % SCHOOLS.length]!,
            sendNeeds: SEND_NEEDS[(i + 2) % SEND_NEEDS.length]!,
          })
          .returning({ id: children.id });

        createdClientIds.push(client!.id);
        createdChildIds.push(childRow!.id);

        await tx.insert(clientChildren).values({
          clientId: client!.id,
          childId: childRow!.id,
          relationship: 'Parent',
        });

        const ownerUserId =
          spec.owner.kind === 'user' ? staffRows[spec.owner.staff]!.id : null;
        const ownerQueue =
          spec.owner.kind === 'queue' ? spec.owner.queue : null;

        const isAppeal = spec.originalQuery.startsWith('Appeal');
        const isClosed = spec.status === 'Closed';

        const [caseRow] = await tx
          .insert(cases)
          .values({
            caseReference: `RS-${YEAR}-${String(1001 + i)}`,
            appealNumber: isAppeal ? `EH${900 + i}/${YEAR}` : null,
            dateOfEnquiry: dateStr(-(45 + i)),
            clientId: client!.id,
            childId: childRow!.id,
            ownerUserId,
            ownerQueue,
            status: spec.status,
            originalQuery: spec.originalQuery,
            currentWork: spec.currentWork,
            methodOfEnquiry: spec.methodOfEnquiry,
            appealLodged: isAppeal,
            representationWanted: isAppeal,
            aims: 'Secure appropriate provision and a lawful, specific plan.',
            finalPlanIssuedDate: isClosed ? dateStr(-25) : null,
            closedDate: isClosed ? dateStr(-20) : null,
            paymentCode:
              spec.status === 'Payment/Billing' ? 'PP' : isClosed ? 'PM' : null,
            discountCode: i % 6 === 0 ? 'AE20' : null,
            invoiceStatusText:
              spec.status === 'Payment/Billing'
                ? 'Invoice raised, awaiting payment.'
                : null,
            retentionUntil: isClosed ? dateObj(365 * 6) : null,
          })
          .returning({ id: cases.id });
        const caseId = caseRow!.id;

        for (const team of spec.teams) {
          await tx
            .insert(caseTeams)
            .values({ caseId, teamId: teamId.get(team)! });
        }

        let documentId: string | null = null;
        if (spec.document) {
          const [doc] = await tx
            .insert(documents)
            .values({
              storageKey: `fixtures/RS-${YEAR}-${String(1001 + i)}/directions-order.pdf`,
              originalFilename: 'directions-order.pdf',
              mimeType: 'application/pdf',
              byteSize: 48_000 + i,
              sha256: i.toString(16).padStart(64, '0'),
              uploadedByUserId: staffRows[0]!.id,
              category: 'Tribunal Order',
              caseId,
              version: 1,
              retentionUntil: dateObj(365 * 6),
            })
            .returning({ id: documents.id });
          documentId = doc!.id;
        }

        for (const dateSpec of spec.keyDates) {
          await tx.insert(keyDates).values({
            caseId,
            date: dateStr(dateSpec.offsetDays),
            time: dateSpec.withTime ? '10:30:00' : null,
            title: keyDateTitle(dateSpec.type),
            description: 'Fixture key date.',
            type: dateSpec.type,
            source: dateSpec.fromDocument ? 'directions_order' : 'manual',
            confidence: dateSpec.fromDocument ? 'medium' : null,
            sourceDocumentId: dateSpec.fromDocument ? documentId : null,
            sourceReference: dateSpec.fromDocument ? 'para 5' : null,
            supersededAt: dateSpec.superseded
              ? new Date(BASE.getTime() - MS_PER_DAY)
              : null,
          });
        }

        const author =
          spec.owner.kind === 'user'
            ? staffRows[spec.owner.staff]!.id
            : staffRows[0]!.id;
        let dayBack = 2;
        for (let n = 0; n < spec.notesCount; n += 1) {
          dayBack += 4 + Math.floor(rng() * 5);
          await tx.insert(caseNotes).values({
            caseId,
            authorUserId: author,
            entryDate: dateStr(-dayBack),
            body: NOTE_BODIES[(i + n) % NOTE_BODIES.length]!,
          });
        }

        if (spec.review) {
          await tx.insert(caseReviews).values({
            caseId,
            reviewedByUserId: staffRows[2]!.id,
            reviewedAt: new Date(BASE.getTime() - 7 * MS_PER_DAY),
            note: 'Supervision review: progress on track, next actions agreed.',
          });
        }
      }

      // Exercise the client_children join both ways: a sibling (one client,
      // two children) and shared parental responsibility (one child, two
      // clients).
      const [sibling] = await tx
        .insert(children)
        .values({
          fullName: `Wren ${PARENT_SURNAMES[0]}`,
          preferredName: 'Wren',
          schoolYear: 'Yr2',
          currentSchoolName: SCHOOLS[0]!,
          sendNeeds: SEND_NEEDS[0]!,
        })
        .returning({ id: children.id });
      await tx.insert(clientChildren).values({
        clientId: createdClientIds[0]!,
        childId: sibling!.id,
        relationship: 'Parent',
      });

      const [secondParent] = await tx
        .insert(clients)
        .values({
          fullName: 'Jordan Fairweather',
          displayName: 'Fairweather, Jordan',
          preferredName: 'Jordan',
          city: 'Fictionton',
          county: 'Exampleshire',
          consentDataProcessing: true,
          consentDataProcessingAt: BASE,
        })
        .returning({ id: clients.id });
      await tx.insert(clientChildren).values({
        clientId: secondParent!.id,
        childId: createdChildIds[3]!,
        relationship: 'Parent (shared responsibility)',
      });
    });

    await writeMarker(sql);

    const rows = await sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM cases`;
    console.log(`Fixtures loaded: ${rows[0]?.count ?? 0} cases.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof FixtureRefusal) {
    console.error(`Refused: ${error.message}`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
