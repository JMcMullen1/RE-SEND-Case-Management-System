import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { londonToday } from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import { listStaffRates, setRate, timeReport } from '../repositories/time';
import {
  SetRateSchema,
  StaffRatesSchema,
  TimeReportQuerySchema,
  TimeReportSchema,
} from './schemas';

const Message = z.object({ message: z.string() });

export function registerTimeRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // One person's recorded time and earnings for a date range. Anyone may see
  // their own; only an admin may see someone else's.
  app.get(
    '/api/time',
    {
      schema: {
        querystring: TimeReportQuerySchema,
        response: {
          200: TimeReportSchema,
          401: Message,
          403: Message,
          404: Message,
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (!current) return reply.code(401).send({ message: 'Not signed in' });
      const userId = request.query.userId ?? current.id;
      if (userId !== current.id && current.role !== 'admin') {
        return reply
          .code(403)
          .send({ message: "Only an admin can see another person's time." });
      }
      const report = await timeReport(
        userId,
        request.query.from,
        request.query.to,
      );
      if (!report) return reply.code(404).send({ message: 'Person not found' });
      return report;
    },
  );

  // Staff rates: admin only, both to read and to set.
  app.get(
    '/api/admin/rates',
    {
      schema: {
        response: {
          200: z.object({ staff: z.array(StaffRatesSchema) }),
          403: Message,
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (current?.role !== 'admin')
        return reply.code(403).send({ message: 'Admins only.' });
      return { staff: await listStaffRates(londonToday(new Date())) };
    },
  );

  app.post(
    '/api/admin/rates',
    {
      schema: {
        body: SetRateSchema,
        response: {
          200: z.object({ staff: z.array(StaffRatesSchema) }),
          403: Message,
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (!current || current.role !== 'admin')
        return reply.code(403).send({ message: 'Admins only.' });
      await setRate(request.body, current.id);
      return { staff: await listStaffRates(londonToday(new Date())) };
    },
  );
}
