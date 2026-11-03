# ADR 0045: Worker-owned marketing planning and aggregate GA4 evidence

Status: accepted for the bounded Store Marketing increment; live acceptance remains a separate gate.

Store Marketing is an independently signed module with its own database and declarative screens. It embeds a read-only GA4 provider behind transport and authentication interfaces. Service-account authentication is implemented; customer OAuth is reserved. The existing host private-file mount, image-bound egress governance, background loop, request idempotency, database transactions and permission checks remain authoritative.

Only daily session/channel and allowlisted ecommerce-event counts are imported. Reports have explicit property/store association approval, fixed TLS endpoints, bounded queries and timeouts, immutable provenance, completeness qualifications and retained failed-read state. Network requests run outside transactions; the saved association generation and request ID must still match before results commit. No other module database is read.

Publication creates a versioned aggregate projection with original snapshot ID/revision. Only explicitly approved publications enter Master analysis; withdrawals remove current authorization without deleting history. Calculations resolve all six source scope fields and compare only compatible non-overlapping periods. Planned budgets do not become ad spend. No attribution joins, non-additive user metrics, revenue, causal conclusions, ROAS, CAC or profit are inferred.

Marketing conditions reuse the existing approved exception stream and Master entity monitoring policy. They do not introduce a new notification subsystem. Local condition acknowledgment and delivered-finding acknowledgment remain distinct records. Unavailable data cannot resolve a previously active condition. Models have no campaign, spend, permission or publication authority.

Consequences: existing Worker-local availability and modular UI are preserved. Operators must separately configure Analytics access and measurement. Aggregate reports cannot prove instrumentation completeness, commercial effectiveness, settlement or profit. A retained snapshot is an observation at a time, not a guarantee that Google will never revise historical reporting. The initial UTM generator permits storefront home pages only. Public reporting is deliberately bounded; large snapshots require a narrower period before explicit publication.
