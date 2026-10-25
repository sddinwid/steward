# ADR 0024 — Read-only Shopify development authentication and image-bound egress

Extend the verified existing Shopify module and SSDS contributions rather than replacing the adapter or renderer. Preserve v0.8.0 and subsequent release tags, migrations, SSMA contract schemas and simulator production workflow.

Use Shopify's current client-credentials grant for app/store pairs within the same Dev Dashboard organization. Keep credentials in the existing per-module private connector file, cache short-lived tokens only in process memory, coalesce acquisition and renew before expiry. Pin the official GraphQL version, TLS origin, returned store identity, development-store flag and installed scope. Live queries are closed constants for shop identity, products and variants. No live order read, dispatch, fulfillment or mutation path is enabled. SSMA fulfillment capability prerequisites additionally require simulator mode; contract bodies are unchanged.

Public connection profiles and durable permission-checked read requests belong to the existing Shopify operational database. Complete validated snapshots are applied atomically and scoped by connection; incomplete/failed reads retain prior data. Request generations protect newer authorized work during an older fetch. The UI remains manifest-driven and receives no secret fields.

Existing module/data networks are internal. Add an optional private operator network grant to the existing module host, not a new proxy/integration service or globally external module network. Bind the grant to original installation/module and exact verified image, validate a dedicated bridge's ownership, and apply it only in live mode. Missing/stale grants fail closed. Simulator and ordinary modules retain their networks. The adapter supplies destination/TLS/read-only checks; Docker egress is not represented as a host firewall.

Reserve the standalone commercial authorization-code flow through a token-provider interface and tested protocol functions. Do not expose an unaudited public callback or pretend customer installation exists. A future host must implement browser/installation-bound single-use state, tenant token encryption/persistence, refresh serialization, revocation and commercial distribution/compliance before enabling customer OAuth.

No new release tag is authorized. Live verification requires real operator-provided organization/store/app configuration and is distinct from simulator acceptance.

Migration 003/004 checkout attributes explicitly retain their already-published CRLF bytes. No migration SQL or applied checksum is rewritten. Build from a Git checkout respecting these attributes; the accepted image/package digests remain authoritative.

Expose only allowlisted static connector-egress denial codes through the Worker configuration API; preserve generic redaction for other runtime errors. Deployed negative-path testing caught the original generic HTTP 500. The narrow correction is covered by regression and deployment checks.
