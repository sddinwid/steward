# ADR 0002 — Persistent installation identity and transactional migrations

Status: accepted. Date: 2026-10-22.

Entity identity and installation identity are separate UUID contracts. Entity display names are configuration, not business constants. Installation role, installation ID, and entity ID are validated before startup and stored in a singleton row. Reattaching configuration with mismatched identity fails startup instead of silently adopting an existing operational database.

SQL migrations are versioned in the platform package. Startup obtains a PostgreSQL transactional advisory lock, applies missing migrations in order, binds/verifies identity, and commits atomically. A newer unrecognized migration version is rejected. Existing migrations must remain immutable; append future ones. The shared schema is core metadata only, with no domain entities or fake event outbox. Future modules must own their schema/versioning boundaries.

The API role is a non-superuser database owner, allowing Phase 1 transactional migrations without giving it server-wide administrative privileges. A separate migration principal is a future hardening step. Initialization scripts only create the database/roles on an empty PostgreSQL volume; API migrations repeat safely on later starts.

`/health` establishes local process liveness and never depends on persistence or Master. `/ready` verifies PostgreSQL access, schema version, and matching identity; database failure returns 503 without connection details. Operational orchestration must distinguish these meanings. Startup requires the local database; an already running API keeps its health route during a database outage. Graceful close uses the [Fastify lifecycle](https://fastify.dev/docs/latest/Reference/Server/).
