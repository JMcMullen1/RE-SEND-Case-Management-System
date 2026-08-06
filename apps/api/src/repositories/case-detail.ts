import { and, asc, desc, eq, gte, ilike, isNull, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  CaseDetail,
  NoteTimelineItem,
  TimelineItem,
} from '@re-send/shared';
import { getDb } from '../db/client';
import {
  caseNotes,
  caseTeams,
  cases,
  children,
  clients,
  keyDates,
  teams,
  users,
} from '../db/schema';

export async function getCaseDetail(id: string): Promise<CaseDetail | null> {
  const db = getDb();
  const owner = alias(users, 'owner');
  const shadow = alias(users, 'shadow');

  const [row] = await db
    .select({
      id: cases.id,
      caseReference: cases.caseReference,
      appealNumber: cases.appealNumber,
      status: cases.status,
      ownerUserId: cases.ownerUserId,
      ownerName: owner.displayName,
      ownerQueue: cases.ownerQueue,
      shadowUserId: cases.shadowUserId,
      shadowUserName: shadow.displayName,
      dateOfEnquiry: cases.dateOfEnquiry,
      methodOfEnquiry: cases.methodOfEnquiry,
      originalQuery: cases.originalQuery,
      currentWork: cases.currentWork,
      consultStatus: cases.consultStatus,
      supportLevel: cases.supportLevel,
      aims: cases.aims,
      clientId: cases.clientId,
      childId: cases.childId,
    })
    .from(cases)
    .leftJoin(owner, eq(owner.id, cases.ownerUserId))
    .leftJoin(shadow, eq(shadow.id, cases.shadowUserId))
    .where(and(eq(cases.id, id), isNull(cases.deletedAt)));

  if (!row) return null;

  const client = row.clientId
    ? (
        await db
          .select()
          .from(clients)
          .where(and(eq(clients.id, row.clientId), isNull(clients.deletedAt)))
      )[0]
    : undefined;

  const child = row.childId
    ? (
        await db
          .select()
          .from(children)
          .where(and(eq(children.id, row.childId), isNull(children.deletedAt)))
      )[0]
    : undefined;

  const teamRows = await db
    .select({ code: teams.code })
    .from(caseTeams)
    .innerJoin(teams, eq(teams.id, caseTeams.teamId))
    .where(eq(caseTeams.caseId, id))
    .orderBy(asc(teams.code));

  const kd = await db
    .select()
    .from(keyDates)
    .where(
      and(
        eq(keyDates.caseId, id),
        isNull(keyDates.deletedAt),
        isNull(keyDates.supersededAt),
      ),
    )
    .orderBy(asc(keyDates.date));

  return {
    id: row.id,
    caseReference: row.caseReference,
    appealNumber: row.appealNumber,
    status: row.status,
    owner: {
      kind: row.ownerUserId ? 'user' : 'queue',
      userId: row.ownerUserId,
      displayName: row.ownerName,
      queue: row.ownerQueue,
    },
    shadowUserId: row.shadowUserId,
    shadowUserName: row.shadowUserName,
    team: teamRows.map((t) => t.code) as CaseDetail['team'],
    dateOfEnquiry: row.dateOfEnquiry,
    methodOfEnquiry: row.methodOfEnquiry,
    originalQuery: row.originalQuery,
    currentWork: row.currentWork,
    consultStatus: row.consultStatus,
    supportLevel: row.supportLevel,
    aims: row.aims,
    client: client
      ? {
          id: client.id,
          fullName: client.fullName,
          displayName: client.displayName,
          preferredName: client.preferredName,
          email: client.email,
          phone: client.phone,
          mobile: client.mobile,
          otherContact: client.otherContact,
          streetAddress: client.streetAddress,
          city: client.city,
          county: client.county,
          postcode: client.postcode,
          additionalNeeds: client.additionalNeeds,
          consentDataProcessing: client.consentDataProcessing,
          consentInformationSharing: client.consentInformationSharing,
          consentContact: client.consentContact,
          consentPrivacyNotice: client.consentPrivacyNotice,
          paymentPlanRequired: client.paymentPlanRequired,
        }
      : null,
    child: child
      ? {
          id: child.id,
          fullName: child.fullName,
          preferredName: child.preferredName,
          dateOfBirth: child.dateOfBirth,
          schoolYear: child.schoolYear,
          currentSchoolName: child.currentSchoolName,
          currentSchoolAddress: child.currentSchoolAddress,
          desiredSchool: child.desiredSchool,
          sendNeeds: child.sendNeeds,
        }
      : null,
    keyDates: kd.map((k) => ({
      id: k.id,
      date: k.date,
      time: k.time,
      title: k.title,
      description: k.description,
      type: k.type,
      source: k.source,
      confidence: k.confidence,
      sourceReference: k.sourceReference,
    })),
  };
}

export interface TimelineFilters {
  authorId?: string;
  from?: string;
  to?: string;
  q?: string;
}

export async function listTimeline(
  caseId: string,
  filters: TimelineFilters,
  current: { id: string; role: string } | null,
): Promise<TimelineItem[]> {
  const db = getDb();
  const conditions = [
    eq(caseNotes.caseId, caseId),
    isNull(caseNotes.deletedAt),
  ];
  if (filters.authorId)
    conditions.push(eq(caseNotes.authorUserId, filters.authorId));
  if (filters.from) conditions.push(gte(caseNotes.entryDate, filters.from));
  if (filters.to) conditions.push(lte(caseNotes.entryDate, filters.to));
  if (filters.q) conditions.push(ilike(caseNotes.body, `%${filters.q}%`));

  const rows = await db
    .select({
      id: caseNotes.id,
      entryDate: caseNotes.entryDate,
      createdAt: caseNotes.createdAt,
      updatedAt: caseNotes.updatedAt,
      body: caseNotes.body,
      authorUserId: caseNotes.authorUserId,
      authorName: users.displayName,
    })
    .from(caseNotes)
    .leftJoin(users, eq(users.id, caseNotes.authorUserId))
    .where(and(...conditions))
    .orderBy(desc(caseNotes.entryDate), desc(caseNotes.createdAt));

  const isAdmin = current?.role === 'admin';
  return rows.map((r): NoteTimelineItem => ({
    id: r.id,
    type: 'note',
    occurredOn: r.entryDate,
    createdAt: r.createdAt.toISOString(),
    authorUserId: r.authorUserId,
    authorName: r.authorName,
    body: r.body,
    canEdit: isAdmin || r.authorUserId === current?.id,
    edited: r.updatedAt.getTime() - r.createdAt.getTime() > 1000,
  }));
}
