# ADR 0011: Governed analytical copies and separate finding lifecycle

Status: accepted for Phase 4.

Master analytical records are explicitly nonauthoritative projections. Their keys include source installation, module, stream and source record ID; every version records enrolled source entity, event ID, source timestamp and ingestion timestamp. Retained inbox events provide provenance, and peer contacts expose freshness. Organization entities reuse the legal registry, including Master's configuration-owned operating entity. Relationships are registered data, never hardcoded business company rules.

Master registry administrators view the ecosystem. Scoped enrollment administrators view only explicitly authorized entities and relationships whose endpoints they may view; viewers receive no analytical access. The receiving exchange resolves entity ownership from the enrollment registry, verifies the bound Worker key, and rejects mismatched source/destination claims. The trusted publisher controls projection columns, while transport proves source identity rather than the business truth of submitted data.

Findings have independent Master revisions and affected entities, explanation, severity, references and open/closed state. Creation/update and recipient outbox materialization share a Master transaction. Workers enrolled later receive matching findings at catch-up. Delivery filters supporting references to the recipient entity. Workers persist inbox deduplication and local finding presentation atomically. Local acknowledgment/resolution changes have separate optimistic revisions and transactional upstream events; subsequent Master updates preserve local status. Master cannot use this channel to edit operational records.

The demonstration dataset is synthetic and stored outside application logic. It records monthly costs/currencies and capacity units without claiming computed savings or AI analysis. AI Analyst, MCP, optimization and offline enrollment remain future work. Projection deletion, automatic retention/compaction, conflict repair and automated credential/PKI rotation are not introduced in this phase.
