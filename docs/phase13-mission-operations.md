# Mission intelligence configuration and verification

Source modules remain independently installed services. Their normal programme, team, case-assignment, referral and financial forms are signed declarative UI contributions. Master Mission Impact improves presentation without replacing that renderer.

For a source programme:

1. A programme owner explicitly grants staff the required programme/case permissions. Worker administrator status supplies no case bypass.
2. Configure the programme's currency and closed canonical reporting period. Record synthetic cases and actual observed synthetic service activity; do not backdate invented operational history.
3. Review and seal one programme aggregate cohort. Small cohorts, complements and correlated differences suppress the complete linked vector.
4. Under Approved resources, record the explicit source programme, recipient organization/programme, restricted use, organizational approval reference, exact-cent cash states and private synthetic approval evidence. An authorized financial reviewer approves and seals the immutable period statement. No external money movement occurs.
5. Under Administration → Programme Aggregate Disclosure, select an authorized programme and enter the receiving Master account UUID shown on its Mission page. Choose read/calculation/publication permissions and a lease of at most3600seconds. Aggregate-only is the default; explicitly select financial statements where needed, which also requires current programme finance permission. Then approve issuance. The existing durable synchronization delivers the signed proof. A current programme publisher can revoke it there. A changed package/installation, disabled issuer or removed programme authority also queues automatic revocation; an outage remains bounded by lease expiry.

At Master:

1. Sign in as the exact named account. Open Mission Impact & Sustainability and explicitly accept each current source disclosure revision. Company/registry access alone does not authorize programme evidence.
2. Review separately attributed fixed programme outcomes, suppression, reporting periods, source references and publication review. No cross-module unique-person total is claimed.
3. Select a canonical release and explicit permitted resource allocations. Enter reviewed hypothetical incremental unit costs and capacity constraints. Blank inputs mean unknown. Review and save the scenario, then calculate.
4. A completed result retains TypeScript exact-cent bounds, independently reconciled SciPy evidence, approved sources and assumptions. Current available balances fund only additional expansion; period funding gap uses period authorized resources. The calculation does not approve eligibility, money movement or services.
5. The optional AI Analyst mission capability uses existing reviewed scenarios and live authorized MCP tools. It cannot invent model-supplied financial inputs. Human finding review is separate. Affected Workers receive findings through existing durable synchronization; their current programme managers acknowledge them.

Revocation during an outage takes effect remotely when synchronization resumes, bounded by the one-hour lease. Restoring connectivity never grants new case access. Scientific or Ollama outages prevent optional investigation/calculation and do not stop local operational services. Retained mission evidence is readable only while every applicable programme lease is current; historical results and AI parent context are not a bypass.

Existing programme creators can use the explicitly confirmed Review programme permission upgrade action after a signed module upgrade. It adds only that package's declared new finance permissions to the active original owner. Delegated managers and revoked creators cannot reclaim owner rights; intentionally removed older rights and case/team revocations stay unchanged. Private planning/calculation history remains owned by its creator. Published findings have separate current programme and financial-disclosure checks, and only actual recipient installations may acknowledge them.

Housing1.0.1 corrects an earlier synthetic-only validation defect: requested service dates did not establish actual elapsed occupancy. Append-only migration006 retains each invalid original record in a private immutable validation ledger, marks its live view `legacy-invalid-historical-basis`, and excludes it from retention. New0-day observations are immediate check-ins only.30/90-day observations require that duration after the actual recorded occupancy confirmation. A cohort retention outcome remains unknown until its relevant observations are due and complete; zero verified observations is not evidence of poor stability. The native suite includes an explicitly controlled-clock logic fixture; no deployed30-day retention is claimed merely because that fixture passes. The existing v1 provider boolean means verified/not verified, so Participant Services conservatively keeps retention unknown where it cannot distinguish not-due from an observed change.

Targeted source checks from the repository root:

```powershell
npm run build -w @steward/contracts
npm run build -w @steward/module-sdk
npm run build -w @steward/mission-kit
npm run build -w @steward/platform
npm run build -w @steward/ui
npm test -w @steward/module-sdk
npm test -w @steward/mission-kit
npm test -w @steward/platform
node --test packages/platform/dist/test/mission-analysis.test.js
node scripts/test-mission-contracts.mjs
node scripts/test-participant-services.mjs
node scripts/test-mission-analytics.mjs
node scripts/test-scientific-governance.mjs
docker build --target test -f services/scientific/Dockerfile -t steward-scientific:1.1.0-test .
docker run --rm --network none --cpus 2 --memory 2g steward-scientific:1.1.0-test
```

Isolated database harnesses clean up their own temporary containers and never mount the operator deployment. Their source-authority/scientific fixtures are explicitly identified in output; they do not prove installed browser workflows, real cross-Worker delivery or live Ollama reasoning. Consult the phase verification report for those separate actual acceptance gates. Do not retag scientific1.0.0 or prior platform/module releases.
