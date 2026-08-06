import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Shared column builders enforcing the universal table rules:
 * every table has a UUID v7 primary key, created_at and updated_at; every
 * client-facing table also carries a deleted_at soft-delete marker.
 *
 * `uuid_generate_v7()` is a database function created by the first migration.
 */

export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`);

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const retention = {
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
};
