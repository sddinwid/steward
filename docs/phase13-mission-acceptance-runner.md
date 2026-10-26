# Mission acceptance runner

These commands exercise an already upgraded selected operator deployment. They
do not install a second stack, install modules, or fabricate operational records.
Run B–F first. The selected deployment must contain `demo/phase13.json`,
`phase13-participants.json`, `phase13-employment.json`, and `phase13-food.json`.
Housing, Employment, Support and Food each need at least five distinct actual
synthetic source subjects. Missing prerequisites fail before publication.

```powershell
$selected = (Get-Content .steward/operator/selection.json | ConvertFrom-Json).directory
$env:STEWARD_SEED_CREDENTIALS_FILE = (Resolve-Path (Join-Path $selected 'demo/presenter.json')).Path
node scripts/verify-phase13-mission.mjs $selected --prove-master-outage
node scripts/verify-phase13-mission-ollama.mjs $selected
```

The first command retains its own private `demo/phase13-mission.json`; it never
rewrites the B–F case files. It sets one canonical closed reporting period,
including existing Food session starts, and refuses to replace a different
already sealed cohort. It records explicit synthetic Housing/Food expenses,
seals the four original source cohorts once, and preserves unknown retention.
No person is deduplicated or summed across modules.

The ordinary Worker 2 **Approved resources** browser form records and seals a
reviewed synthetic Employment resource statement for Housing: USD 7,500
authorized, USD 5,000 available, USD 2,500 committed,
USD 2,000 transferred and USD 1,000 spent, with stable authority/transfer IDs.
These are entered demonstration cash states, not payments executed by Steward.
Both source and target programmes authorize the actual named Master account;
financial disclosure requires the source's additional financial permission.
The original coordinator separately issues that source disclosure through
**Administration → Programme Aggregate Disclosure**. Financial sealing does not itself
authorize Master sharing. Currency amounts in the Worker form are USD units;
the verifier checks that storage contains exact integer cents. Retries preserve
an already sealed allocation, and report separate browser creation/sealing flags
instead of claiming those actions happened again.

The normal Master browser creates and reviews a scenario with USD 1,000
incremental unit cost and six available planning units. Exact-cent calculations
and the scientific service must independently agree on five conditional units
and USD 5,000 incremental cost. The source cohort's USD 6,000 cost is compared
with authorized USD 7,500 period resources, giving a zero period gap. None of
these calculations reserves a unit, transfers funds or approves eligibility.
The browser then reviews/publishes the finding and acknowledges it on Worker 1
and Worker 2. Worker 3 must not receive this two-source finding.

The second command uses the existing real Ollama bridge and the installed
`qwen2.5:7b`, with its separate larger-context alias. The model must select the
authorized mission MCP tools, retrieve fixed programme aggregates, and invoke
the retained reviewed scenario.
The verifier re-resolves current programme authority, independently recomputes
the retained exact-cent calculation and checks the scientific result and full
source references. It retains actual model turns, tool calls, timings and final
wording for human review. It does not automatically publish model wording.
The existing bridge restores provider configuration and private credentials in
`finally` and unloads the test alias. An interrupted run's private recovery
journal is under the deployment's `analyst` directory; follow the existing local
provider recovery procedure before retrying a locked run.

Evidence is written to `artifacts/phase13-mission-verification.json`, browser
screenshots named `phase13-mission-*`, and `artifacts/phase13-mission-ollama.json`.
These filenames do not establish success: inspect their recorded status and
actual command exit codes. A missing model, expired lease, suppressed cohort,
malformed response or timeout remains a failed/unverified gate. Never alter a
cohort or infer retention to turn a failed gate into a successful one.

After separately reading the actual model narrative and retained calculation,
an authorized reviewer can identify that exact investigation for browser
publication and affected-only Worker acknowledgments:

```powershell
$env:STEWARD_REVIEWED_INVESTIGATION_ID = '<independently reviewed investigation UUID>'
node scripts/review-phase13-mission-ollama.mjs $selected
```

This review is separate from the deterministic Mission workspace finding. The
reviewer checks the saved investigation and evidence again; it does not rerun
the model or silently replace its sources. No business operation is authorized.

For the expanded acceptance, run the explicit provider capacity workflow before
the first G/H seal. It creates programme-specific resource allocations and fresh
signed reads; it does not retrain the six participants. Existing sealed releases
remain unchanged when this is added to an older deployment.

```powershell
node scripts/verify-phase13-capacity.mjs $selected
node scripts/verify-phase13-essential-services.mjs $selected
node scripts/verify-phase13-mission.mjs $selected
node scripts/verify-phase13-operational-alerts.mjs $selected
node scripts/verify-phase13-comparison.mjs $selected
$env:STEWARD_OLLAMA_MISSION_COMPARE = '1'
node scripts/verify-phase13-mission-ollama.mjs $selected
```

The comparison helper preserves the original reviewed scenario and creates a
second reviewed alternative over identical evidence, with USD 1,250 rather than
USD 1,000 incremental unit cost. Actual exact-cent/SciPy results must be four
versus five conditional service units, each using USD 5,000. The original funding
and participants are not modified. Operational alerts from historical releases
with missing optional fields may honestly be unknown; only a fresh first-seal
clean scenario proves the new fields, without rewriting old cohorts.

Read `artifacts/phase13-mission-ollama-comparison.json` and its full retained
evidence before identifying the actual investigation for separate publication:

```powershell
$env:STEWARD_REVIEWED_INVESTIGATION_ID = '<independently reviewed comparison investigation UUID>'
node scripts/review-phase13-mission-ollama.mjs $selected
Remove-Item Env:STEWARD_OLLAMA_MISSION_COMPARE
Remove-Item Env:STEWARD_REVIEWED_INVESTIGATION_ID
```

The comparison report is separate from earlier single-scenario evidence. A
failed run is retained as failed; never replace its ID or result with a test
model. One-hour disclosure leases may need explicit renewal and acceptance by
the same authorized accounts before reading, calculating or publishing.

The credential file must identify the same actual named Master account for scenario creation, source disclosure, model investigation and final human review. Use the appropriate existing account file for a clean installation; do not replace operator passwords. With `--prove-master-outage`, first-time aggregate publication stops Master briefly, proves the sealed records remain in each dedicated module database outbox, restores Master, then verifies authorized synchronization. Reruns cannot claim a new outage publication for already sealed releases.
