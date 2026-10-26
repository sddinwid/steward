# Reviewed mission alternatives

Master's Mission Impact workspace can compare two or three existing, explicitly
reviewed planning scenarios. The selection must use the exact same fixed release
and allocation references, target programme, service and currency. Only the
already-reviewed cost, capacity and maximum-unit assumptions may differ. These
are conditional alternative plans, never participant decisions or commitments.

`POST /api/v13/mission/comparisons` accepts a UUID `comparisonId` and two or three
distinct `scenarioIds`. Session, CSRF, scenario ownership and current source-issued
programme permissions apply. A comparison does not accept model-supplied costs,
new source dimensions, funding claims, participant records or live reservations.

Every child runs through the existing exact-cent and bounded scientific
calculation path. The retained wrapper is explicitly labeled
`steward.mission.scenario-comparison`; it is not another scientific computation.
Its immutable input retains every scenario/calculation identity and complete
paired source evidence. The alternatives share their source evidence; their
money, participants and capacities must never be added together. Reads and
human-reviewed finding publication recheck all child evidence and current
permissions. A finding links the wrapper, retains all child identities and uses
the existing affected-Worker synchronization path.

Repeat the same request with the same `comparisonId` to recover an interrupted
attempt. Child calculation identities are stable. Already completed children
remain visible in authorized calculation history and are reused. No completed
wrapper is retained until every selected child returns. An interrupted audit
record identifies retained children. Concurrent identical requests may return
`409 COMPARISON_IN_PROGRESS`; retry the original identity and payload after the
active request finishes. Conflicting content under an existing identity is
rejected. No destructive rollback or implicit financial authority is performed.

The read-only MCP tool `compare_mission_scenarios` accepts only the reviewed IDs.
Before selecting a scenario the mission profile actually invokes
`query_mission_aggregates` to inspect a bounded authorized page of fixed programme
capacities and outcomes. Only pagination and whitelisted presentation-field
selection are accepted; no arbitrary participant dimensions or time filtering.
Historic releases without training capacity or employment opportunities retain
their unknown values. Full sealed releases remain in retained tool activity,
while the model receives only the relevant selected fields and formatted money.
The model must discover and invoke it itself. Model-facing amounts are formatted
from integer cents; complete raw evidence remains retained internally. Final
validation requires each scenario ID, known calculated monetary values and
conditional unit count. One evidence-mismatch correction is allowed within the
existing investigation budgets. Publication remains a separate human action.

Automated verification uses `node scripts/test-mission-analytics.mjs` for real
PostgreSQL/session/MCP checks (the scientific client there is an explicit fixture)
and `node scripts/test-mission-analyst-presentation.mjs` for Chromium presentation
fixtures. Neither establishes live Qwen acceptance. The existing real-provider
wrapper supports `STEWARD_OLLAMA_MISSION_COMPARE=1`:

```powershell
$env:STEWARD_SEED_CREDENTIALS_FILE='<same private named-account file used for G>'
node scripts/verify-phase13-comparison.mjs .steward/phase8-upgrade-regressions
$env:STEWARD_OLLAMA_MISSION_COMPARE='1'
node scripts/verify-phase13-mission-ollama.mjs .steward/phase8-upgrade-regressions
```

The wrapper selects the actual reviewed IDs and removes a stale scalar prompt.
It writes a separate `artifacts/phase13-mission-ollama-comparison.json`
by default and recomputes each retained child and scientific result. Preserve the
reviewed single-scenario evidence. Renew source-issued named-account leases via
their existing explicit review flow when expired; never bypass them for a demo.

Two comparative live runs returned HTTP200/`done:true` with no content or native
tool calls: one after aggregate discovery, another at the first tool stage. The
provider did not expose raw generated text explaining this. Tool-prompt
interference is a hypothesis, not a proven Ollama parser defect or context-limit
failure. The profile now keeps only current-step guidance in the tool phase.
One genuinely empty tool-phase response may receive logged protocol feedback and
another model turn within the existing step/time budget. No call is manufactured,
no tool executes during repair, and a new valid native call remains required.
A second empty response fails `MODEL_OUTPUT_INVALID`; malformed nonempty output
and final responses receive no protocol repair. This does not establish live
comparison success: the acceptance gate remains open until an actual rerun passes.
