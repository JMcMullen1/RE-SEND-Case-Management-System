import { encryptField, protectStoredField, readField } from './encryption';

/**
 * The fields stored encrypted: special category information (health, needs,
 * the aims of a case) that the database never searches, sorts or matches on,
 * so encrypting it costs nothing. Names, dates of birth and contact details
 * are left readable to the database because it matches families by them
 * (duplicate checks, the import, email filing); notes, emails and document
 * text because they are searched. The database and disk are encrypted at rest
 * in any case.
 */
export const SENSITIVE_FIELDS = {
  clients: ['additionalNeeds'],
  children: ['sendNeeds'],
  cases: ['aims'],
} as const;

/** The same, by database column (for the export and the start-up pass). */
export const SENSITIVE_COLUMNS: Record<
  keyof typeof SENSITIVE_FIELDS,
  string[]
> = {
  clients: ['additional_needs'],
  children: ['send_needs'],
  cases: ['aims'],
};

type Table = keyof typeof SENSITIVE_FIELDS;

/** A row or patch for `table` with its sensitive fields encrypted. */
export function encryptSensitive<T extends object>(table: Table, row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const field of SENSITIVE_FIELDS[table])
    if (field in out)
      out[field] = encryptField(out[field] as string | null | undefined);
  return out as T;
}

/** A row read from `table` with its sensitive fields readable (see readField). */
export function decryptSensitive<T extends object>(table: Table, row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const field of SENSITIVE_FIELDS[table])
    if (field in out)
      out[field] = readField(out[field] as string | null | undefined);
  return out as T;
}

/** A stored row's sensitive fields kept encrypted, or encrypted if not yet. */
export function protectSensitive<T extends object>(table: Table, row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const field of SENSITIVE_FIELDS[table])
    if (field in out)
      out[field] = protectStoredField(out[field] as string | null | undefined);
  return out as T;
}

/** Every sensitive field name, in any table (as the audit trail records them). */
export const ALL_SENSITIVE_FIELDS: readonly string[] =
  Object.values(SENSITIVE_FIELDS).flat();
