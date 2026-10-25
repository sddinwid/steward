# ADR 0026 — Governed scientific analytics and evidence-preserving executive views

Status: Phase 12 pre-implementation architecture/gap assessment.

Baseline v0.11.0 resolves to 53e646f; Phase 12 branch codex/phase12-scientific-intelligence. The existing full build, 164 regression checks and selected-stack smoke pass before changes. Preserve the tagged release, private configuration, accounts, installation identities, ordinary and synthetic records, module installations, and Worker 3 live Shopify/Printify catalog connections. No paid production or external mutations are authorized.

## Existing boundaries and gaps

No Python service, Python project or concrete scientific transport exists. `AnalyticalService` is a reserved abortable interface in shared contracts. `analytical-capabilities.ts` supplies the existing versioned analytical capability interface/resource-sharing implementation; canonical business, commerce and simulation calculators are existing evidence-backed services. MCP is the authenticated request-scoped official SDK server; Analyst is an authenticated real MCP client with provider-independent budgets, planning profiles and retained full evidence. Scientific operations extend that existing capability catalog/MCP path rather than introducing another authority registry or arbitrary code executor.

Authoritative business data remains in isolated Worker/module databases. Master already holds scoped disclosed projections and full sync provenance. Scientific transport will receive only a bounded, minimized, authorized snapshot from Master, never database credentials. A derived-history fixture is a separately labeled synthetic analytical dataset in Master, never invented/backdated operational orders. Current short simulation history cannot validate long-term seasonality or census completeness.

Existing React/SSDS workspaces and the module-contributed renderer remain. Current shared report SVGs lack sufficient interval/axis/relationship interaction, and Companies duplicates much of Overview. Extend shared data-only visualization primitives; keep independently packaged module navigation/forms/operations. Worker financial reporting currently omits a visible fee reconciliation even though Sales records contain fees; expose those existing amounts without inventing expenses.

## Implementation decisions

Add one optional independently containerized Python service using pinned supported Python, NumPy, SciPy, pandas, FastAPI and pytest. Closed v1 inputs/results identify dataset/provenance, method/version, assumptions and limits. Master authorizes every input/result/finding access under existing entity scopes and disclosure rights. Authenticated bounded service requests use private per-installation credentials and internal networking (production TLS/trust documented). Python has no Docker socket, Worker secrets, commerce credentials, database connection or executable-code interface.

Run calculations in individually cancellable subprocesses, with bounded admission, wall/CPU/memory/dataset/solver budgets and BLAS thread limits. Failures/infeasibility/timeouts remain structured, not fabricated successes. Master persists immutable input snapshots/results independently, so historical reports, deterministic monitors, synchronization and ordinary Worker services continue without Python. Append platform migrations only. Restarted in-flight scientific work is marked interrupted, not silently retried or represented as complete.

Forecasts compare moving-average baselines and interpretable trend/adequately supported seasonal regression with chronological backtesting. Missing slots are missing observations, not invented zero transactions. No seasonal model with inadequate cycles. Supported regression prediction intervals use explicit error assumptions/diagnostics and independent synthetic validation, not arbitrary percentage bands; unsupported uncertainty is null with a reason. All synthetic analytical history and derived forecasts carry explicit labels and cannot be promoted into actual business activity.

Procurement uses SciPy/HiGHS mixed-integer optimization for indivisible quantities, supplier tier selection, capacity/MOQ and fixed shipping. Validate every returned constraint/integrality/objective tolerance independently and recompute money in integer cents. Reuse current deterministic purchasing contracts/calculation as the reference baseline, retain source terms, and label extra capacity/pricing assumptions. Allocate shipping with an exact deterministic remainder, charge transition once, exclude intercompany transfers, and flag individual losses even when ecosystem benefit is positive. Unsupported constraints/currency conversions are rejected.

Scenarios are bounded deterministic what-if inputs, not probability distributions or operational grants. Scientific findings use the existing human-created finding lifecycle and affected-only durable delivery, with source minimization. Existing deterministic calculations/monitoring remain available. LLMs see compact governed tool outputs; full source evidence stays in Master. There is no Python execution tool or model-granted authority.

Mission readiness is documented through neutral extension contracts, not sensitive participant data or a case-management subsystem. Commercial customers retain the same entity/currency/security boundaries.

## Verification and release sequence

Implement A through P sequentially; preserve passing checkpoints. Scientific tests must cover known synthetic signals, leakage, missing/irregular data, reproducibility/interval behavior and independently enumerated optimization reference cases. Then test Master authorization/unavailability/cancellation, module/UI/MCP integration, real Qwen, actual two-Worker browser activity, live read-only catalogs, existing regressions, clean install and retained-data upgrade. One active operator stack; stop all owned core/managed-module containers before temporary full-stack acceptance, always restore in cleanup. Tag v0.12.0 only after mandatory gates pass; record failed/unverified gates honestly.
