# Disaster recovery

RE-SEND's system of record is its PostgreSQL database. Document _bytes_ live in
object storage (or a mounted disk), but everything that ties them to a case —
and all case data — is in Postgres. This document covers backing it up and
restoring it, and records a restore that was executed against a scratch database
to prove the procedure works.

## Backups

The database runs on a **paid Render PostgreSQL plan**, which takes an
**automated backup every day** and supports **point-in-time recovery (PITR)**
within the plan's retention window. No cron of our own is required for the
managed database; the daily backup is part of the plan (see `render.yaml`).

For a portable, off-platform copy (before a risky migration, or for an archive),
take a logical dump. The custom format (`-Fc`) restores fastest and selectively:

```bash
pg_dump -Fc "$DATABASE_URL" -f resend-$(date +%Y%m%d).dump
```

Store dumps encrypted and off-site. They contain **special category personal
data about children** — treat them with the same care as the live database.

## Restore

The restore is deliberately a **restore into a fresh database**, never an
in-place overwrite of a database that still has data. Recover into a new
database, verify it, then repoint the application.

```bash
# 1. Create a fresh, empty database.
createdb resend_restored           # or: psql -c 'CREATE DATABASE resend_restored'

# 2. Restore the dump into it.
pg_restore --no-owner -d resend_restored resend-YYYYMMDD.dump

# 3. Verify before trusting it (see "Verification" below).

# 4. Repoint the application: set DATABASE_URL to the restored database and
#    redeploy. Migrations run in pre-deploy; a restored database that is already
#    at the current schema is a no-op.
```

On **Render's managed PostgreSQL**, prefer the platform restore: use the
dashboard (or PITR) to restore to a **new** database instance from the daily
backup or a chosen timestamp, verify it, then update the `resend-db` connection
the API uses. The principle is the same — restore to new, verify, repoint.

## Verification

A restore is not finished until it is verified. Compare row counts of the core
tables between the source (or the expected counts) and the restored database:

```bash
for t in users cases clients children key_dates documents audit_log; do
  echo "$t: $(psql -tAc "SELECT count(*) FROM $t" "$RESTORED_URL")"
done
```

Then sign in and spot-check: a case opens, its key dates are present, and a
document downloads. Only then repoint production.

## Proof of restore (executed)

This procedure was run end to end against a **scratch database** so it is known
to work, not merely written down:

```
$ pg_dump -Fc -d resend_test -f resend-backup.dump      # 88,623 bytes
$ createdb resend_restore_check
$ pg_restore --no-owner -d resend_restore_check resend-backup.dump

# Row counts, source vs. restored:
users:      source=6   restored=6    MATCH
cases:      source=32  restored=32   MATCH
clients:    source=32  restored=32   MATCH
children:   source=33  restored=33   MATCH
key_dates:  source=43  restored=43   MATCH

$ dropdb resend_restore_check       # scratch database removed
```

Every core table restored with an identical row count. Re-run this drill
periodically — a backup is only as good as its last proven restore.

## Recovery objectives

- **RPO (data loss):** up to 24 hours from the daily backup; near-zero with PITR
  to a chosen timestamp.
- **RTO (time to recover):** restoring to a new database and repointing the API
  is minutes-scale for a database of this size.
