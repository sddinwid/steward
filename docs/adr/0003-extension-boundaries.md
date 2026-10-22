# ADR 0003 — Explicit contracts without simulated later features

Status: accepted. Date: 2026-10-22.

The contracts package defines entity/installation identity, module capability manifests, and synchronization envelopes independently from Fastify or PostgreSQL. The platform package exposes a module registration/lifecycle interface. A future separately packaged module can describe compatible core versions and typed capabilities; loading, dependency resolution, trust, migrations, and installation are not implemented.

Authenticated enrollment, MCP server adapters, analytical services, and durable event transport have explicit TypeScript interfaces only. No concrete adapter is registered, no stub success response exists, and no network call is simulated. The read-only platform overview marks each extension `not_implemented`. No executable enrollment, analytics, synchronization, or MCP endpoint exists.

Envelope v1 reserves event/source/destination identity, decimal sequence, timestamp, payload version, and correlation ID. It is a design boundary, not a guarantee of storage, delivery order, retries, deduplication, acknowledgments, or schema validation. Future implementation must settle these semantics before deployment. Python analytical services are reserved for that future implementation; Phase 1 has no Python runtime dependency.

This avoids a misleading prototype surface while keeping business modules out of the core. No company-specific logic, names, IDs, or credentials appear in application behavior.
