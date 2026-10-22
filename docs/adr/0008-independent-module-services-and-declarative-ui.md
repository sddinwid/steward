# ADR 0008: Independent module services with versioned declarative UI

Status: accepted for Phase 3.

Inventory must arrive on an already running Worker without rebuilding core or executing arbitrary extension code in the core/frontend. A module is a separately versioned OCI service plus Ed25519-signed descriptor. SDK/manifest v1 declares compatibility, dependencies, permissions, configuration, persistence/migration hashes, API, UI, events and analytical capabilities. Core only implements a generic lifecycle manager, authenticated gateway and validated declarative CRUD renderer. Inventory source is outside the root workspace and absent from core Dockerfiles/runtime bundles.

API contributions use declared paths and module-local permissions. Discovery filters screens by actual authorized list operations; write permissions independently gate gateway and service forwarding. No publisher JS/assets are loaded. The first SDK supports generic CRUD screens; richer UI needs a future explicitly versioned contribution contract. Event/analytical declarations reserve interfaces without implementing delivery or services.

Each installed module gets a dedicated role/database in its Worker's PostgreSQL server, its own immutable service image and durable secrets. Core and module schema histories are independent. Worker enrollment and local availability do not depend on Master or module health. Deactivation stops service access while preserving records. Active upgrades and uninstall are deliberately unsupported, rather than approximated.
