# Database

- UUID primary keys on Simbe-owned tables (`id uuid default gen_random_uuid()`). Imported leads keep the export's `lead_id` as `external_id` plus a surrogate UUID `id`.
- Every tenant table has `agency_id uuid NOT NULL` with an index, and child tables use composite FKs or `agency_id` checks so a row can never point at another agency's lead.
- Timestamps are `timestamptz`, stored in UTC. Convert to the agency time zone **at display/aggregation time** (`AT TIME ZONE agencies.timezone`).
- Prevent N+1: `includes`/`preload` in services; add `bullet`-style assertions (`expect { }.to make_database_queries(count: N)`) for list endpoints.
- Heavy aggregates are SQL (CTEs / views), not Ruby loops over 30k leads.
- **Snapshot replace**: one transaction, `DELETE … WHERE agency_id = ?` in FK-safe order (children via `ON DELETE CASCADE` from leads), bulk insert with `insert_all`/`COPY`, then commit. A failure rolls back to the previous snapshot.
- Migrations are reversible; no data migrations inside schema migrations.
