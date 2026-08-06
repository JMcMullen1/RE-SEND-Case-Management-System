# RE-SEND Case Management System

Single-tenant case management for RE-SEND, an advice and advocacy charity
supporting children with special educational needs. See `CLAUDE.md` for the
stack, invariants and conventions.

## Development

```
npm install
npm run check          # typecheck, lint, format check, unit tests
npm run test:e2e       # Playwright
```

Database (PostgreSQL via Drizzle):

```
npm run db:migrate -w @re-send/api     # apply checked-in SQL migrations
DATABASE_URL=... NODE_ENV=development npm run fixtures:load   # dev data only
```

## Live updates

The app updates live for every signed-in user so nobody works from a stale
view.

- A **generic** Postgres trigger function (`notify_entity_change`) emits a
  `NOTIFY` on the `entity_change` channel carrying the table name, row id and,
  for rows that belong to a case, the owning case id. Adding a table to live
  updates is **one `CREATE TRIGGER` line** in a migration — the function is
  never duplicated. It is applied to `cases`, `case_notes`, `key_dates` and
  `case_reviews`; `documents`, `emails` and `time_entries` are registered as
  inert entries in the API registry.
- The API holds a **single `LISTEN` connection** and fans each notification out
  over WebSockets, mapping entity type to the affected TanStack Query keys
  through a registry. Because the notification originates in Postgres, this
  works unchanged with **more than one API instance**: every instance listens
  and forwards to its own clients. (Presence — who else has a case open — is
  tracked per instance; a multi-instance deployment would share it through the
  same channel or a cache.)
- The client keeps one WebSocket, invalidates the **precise** query keys it is
  told about, reconnects with **exponential backoff**, and on reconnect
  **refetches** rather than trusting the cache. A small banner shows while the
  channel is down so users know the live guarantee is suspended.

### Render free tier

**Render's free tier spins services down after inactivity.** A spun-down
service drops all WebSocket connections and stops holding the `LISTEN`
connection, so live updates — and this feature as a whole — break until the
service is woken by the next HTTP request (which also incurs a cold start).
Run the API on a paid, always-on instance for live updates to hold.
