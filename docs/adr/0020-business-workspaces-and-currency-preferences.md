# ADR 0020: Business workspaces and explicit currency preferences

Status: accepted for implementation; UI acceptance in progress.

Keep React, the shared UI package, signed declarative module contributions and existing APIs. Add hash-based deep links so existing nginx deployments require no router rewrite. Navigation is permission-filtered discovery; business, administration and developer workspaces separate presentation, while backend roles and module permissions remain authoritative. Local administrators already hold technical module governance authority; ordinary module users never acquire that authority through a route.

Resolve the business company name from persisted enrollment, retaining bootstrap/configuration identity in labeled diagnostics. Do not modify certificates, reassociate records or rewrite immutable release manifests.

Append migration 10 for entity preferences in the installation database. Preferences are audited, administrator-controlled, entity-scoped and persistent without Master connectivity. Do not infer country or relabel historical currencies. New US company setup proposes USD; installing a new currency-aware module inherits the explicit local preference. Existing module configurations remain unchanged until separately reviewed. There is no exchange-rate subsystem or implicit cross-currency total.

Allow authenticated local module users to read the already affected-only local findings projection. Acknowledgment/resolution remains local_admin-only. Master records, investigations and findings keep their existing entity/account authorization rules.

Raw diagnostic contracts remain available in the technical workspace and advanced disclosure controls. No remote scripts, arbitrary HTML, unsigned assets, alternate module installation path or additional frontend framework is introduced.

Discovery exposes only a validated, non-secret module currency default from approved local configuration. Operational forms prefer this module default to the company base currency. This keeps a retained EUR module usable when the company chooses USD for new modules; original transaction currency still controls displayed amounts. Full module configuration is never exposed through normal-user discovery.
