import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  KEY_DATE_TYPE_LABELS,
  KEY_DATE_TYPE_VALUES,
  STATUS_VALUES,
  buildICalendar,
  loadBankHolidayEvents,
  type CalendarFilters,
  type KeyDateType,
  type Status,
} from '@re-send/shared';
import {
  ensureIcalToken,
  listCalendarEvents,
  rotateIcalToken,
  searchCasesForCalendar,
  userForIcalToken,
} from '../repositories/calendar';
import { resolveCurrentUser } from '../repositories/users';
import {
  BankHolidaysResponseSchema,
  CalendarCaseMatchSchema,
  CalendarEventSchema,
  CalendarQuerySchema,
} from './schemas';

function actorId(headers: Record<string, unknown>): string | undefined {
  const raw = headers['x-user-id'];
  return typeof raw === 'string' ? raw : undefined;
}

/** Parse a comma-separated list, keeping only values in the allowed set. */
function parseList<T extends string>(
  csv: string | undefined,
  allowed: readonly T[],
): T[] | undefined {
  if (!csv) return undefined;
  const set = new Set<string>(allowed);
  const out = csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => set.has(s)) as T[];
  return out.length > 0 ? out : undefined;
}

/**
 * The shared calendar. A query endpoint for the app's views, a per-user
 * token-authenticated iCal feed for phones, a case typeahead for adding dates,
 * and the bank-holiday set for working-day-aware pickers.
 */
export function registerCalendarRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/calendar',
    {
      schema: {
        querystring: CalendarQuerySchema,
        response: { 200: z.object({ events: z.array(CalendarEventSchema) }) },
      },
    },
    async (request) => {
      const current = await resolveCurrentUser(actorId(request.headers));
      const q = request.query;
      const filters: CalendarFilters = {
        scope: q.scope,
        userId: q.userId ?? null,
        team: q.team ?? null,
        types: parseList<KeyDateType>(q.types, KEY_DATE_TYPE_VALUES),
        statuses: parseList<Status>(q.statuses, STATUS_VALUES),
        includeSuperseded: q.includeSuperseded,
        from: q.from,
        to: q.to,
      };
      const events = await listCalendarEvents(filters, current?.id ?? null);
      return { events };
    },
  );

  // Case typeahead for the "add key date" picker on the calendar.
  app.get(
    '/api/calendar/case-search',
    {
      schema: {
        querystring: z.object({ q: z.string().min(1) }),
        response: {
          200: z.object({ cases: z.array(CalendarCaseMatchSchema) }),
        },
      },
    },
    async (request) => ({
      cases: await searchCasesForCalendar(request.query.q),
    }),
  );

  // Bank holidays for working-day-aware date pickers (feed, snapshot fallback).
  app.get(
    '/api/bank-holidays',
    { schema: { response: { 200: BankHolidaysResponseSchema } } },
    async () => {
      const { events, source } = await loadBankHolidayEvents();
      return { source, events: events.map((e) => ({ ...e })) };
    },
  );

  // The current user's iCal subscribe URL (token created lazily).
  app.get(
    '/api/calendar/feed-url',
    {
      schema: {
        response: {
          200: z.object({ path: z.string().nullable() }),
        },
      },
    },
    async (request) => {
      const current = await resolveCurrentUser(actorId(request.headers));
      if (!current) return { path: null };
      const token = await ensureIcalToken(current.id);
      return { path: token ? `/api/calendar/feed/${token}.ics` : null };
    },
  );

  // Rotate the token, revoking the old feed URL.
  app.post(
    '/api/calendar/feed-url/rotate',
    {
      schema: { response: { 200: z.object({ path: z.string().nullable() }) } },
    },
    async (request) => {
      const current = await resolveCurrentUser(actorId(request.headers));
      if (!current) return { path: null };
      const token = await rotateIcalToken(current.id);
      return { path: token ? `/api/calendar/feed/${token}.ics` : null };
    },
  );

  // The token-authenticated feed itself. No session — the token in the URL is
  // the credential a phone's calendar app carries. Read-only, live key dates.
  app.get(
    '/api/calendar/feed/:token.ics',
    { schema: { params: z.object({ token: z.string().min(1) }) } },
    async (request, reply) => {
      const user = await userForIcalToken(request.params.token);
      if (!user) return reply.code(404).send('Unknown calendar feed');
      const events = await listCalendarEvents(
        { scope: 'user', userId: user.id, includeSuperseded: false },
        user.id,
      );
      const body = buildICalendar(events, {
        calName: `RE-SEND — ${user.displayName}`,
        now: new Date(),
        typeLabels: KEY_DATE_TYPE_LABELS,
      });
      reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', 'inline; filename="re-send.ics"')
        .header('cache-control', 'private, max-age=300')
        .send(body);
    },
  );
}
