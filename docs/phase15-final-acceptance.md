# Phase 15 final acceptance

## Source and release boundary

Built candidate: `4c07ffb0980e891f917f1755ff380e4241219f40`, branch `codex/phase15-catalog-pricing`. Candidate bundle: `artifacts/releases/steward-0.15.0-candidate-4c07ffb`. Release promotion/tagging remains controlled by all eighteen mandatory gates; no GitHub push is authorized. Final evidence-only commits may follow the built source without changing its verified payload.

Genuine native investigation ran on `8552bf2c40a88bffa9f681f23faebd24d3a61f86`. The only later changes are the acceptance browser helper and verification documentation. Exact application source and **all eight runtime filesystem layer sets** match the final candidate (`phase15j-native-runtime-equivalence-4c07ffb.json`). Original evidence retains its actual source identity. The helper correction is packaged in the final toolkit.

## Implemented and exercised

Universal Catalog **1.4.0** and Pricing Management **1.3.1** are separately signed/installed on all three original Workers. Catalog supports physical products/variants, services, subscriptions, rentals, digital offerings and bundles, typed attributes, explicit external mappings and append-only history through the shared SSDS renderer. Pricing supports reviewed policies, exact monetary resolution, retail/wholesale/channel/promotion precedence, scheduled revisions, source-bound quotes, explicit activation and immutable accepted Sales prices.

Installed synthetic Sales retained its accepted 800-cent transaction, original provider obligations, cumulative fulfillment and independent Inventory/Ledger authority. Unknown packaging cost remains unknown until separately reviewed; explicit estimates do not become actual profit. External source mappings preserve original provider identity and do not transfer Shopify/Printify authority. Historical Worker1/2 providers and outstanding work remain pinned; only approved new work uses selected replacement providers.

| Verification | Actual result |
|---|---|
| Full build and uninterrupted final-source `npm test` | PASS; **1,103 Node tests /69 summaries**, zero failures, exit0 |
| Committed SQL/source integrity | PASS10; all88 original SQL byte hashes and signed ancestry retained |
| Scientific engine | PASS88 Python tests and authenticated nonroot/network-isolated service |
| Scientific governance / reconciliation / presentation | PASS28 /5 /8 Chromium checks; presentation fixtures use actual Python, not deployment proof |
| Final selected in-place upgrade | PASS8; **44 module DBs,666 tables,159 private files,7 volumes**, original accounts/identities/configuration/provider pins retained |
| Final clean candidate | PASS6; copied toolkit build, schema19, TLS enrollment, repeated provisioning, independent Workers/modules, durable outages, backup restore and redeployment |
| Clean module acceptance | PASS6; Pricing without Catalog, Catalog without Pricing, legacy Sales without either, all six offering types, original records/identities retained |
| Selected outage | Prior PASS6 with unchanged operational/synchronization source; final clean recovery is complementary, not a claim of rerunning that exact selected scenario |
| Final native browser inspection | PASS3 /8 screenshots; exact same investigation/finding/receipts, no browser errors |
| Active live Shopify catalog | PASS read-only auth/store/catalog, API2026-10,17 products/26 variants |
| Active live Printify catalog | PASS fresh automatic GET receipt,5 products/625 variants; no production/reconciliation action |
| Final topology/resources | One selected stack,60 running containers, approximately3.62GiB measured container memory; zero Ollama models loaded |

Final clean acceptance restored **exact original container IDs/images/volume mounts and operator selection**, with no cleanup errors. Its retained stopped temporary project is `steward-p15-clean-8524c7b7f86448239189`; no temporary full stack remains running. Backup restoration used only a new scratch database inside that disposable clean deployment. Original volumes were never reset.

## Native model and independent review

The separate RecommendationReview scenario is a fresh reviewed continuation of the failed/expired BasisReview cases; their original observations and validity windows remain unchanged. Qwen2.5:7b via the existing16384-context alias made **8 model calls and5 live MCP executions in94,554ms**: scoped summary, publication discovery, each original evidence source, deterministic contribution comparison, model-written factual summary and recommendation. One malformed source UUID was rejected and corrected within the existing single-correction budget. No validator, authority or timeout guard was weakened.

Both scenarios contain seven sessions at USD3.00 each: prospective revenue USD21.00; reviewed estimated variable costs USD7.00/8.40; conditional TOTAL contribution USD14.00/12.60. Separate source evidence and arithmetic checks confirmed the quantities, session unit, reviewed supplier-acquisition N/A and estimated labor basis. Unknown identity remains unknown; identical labels/cohort do not establish equivalent products/suppliers. No unsupported per-unit contribution, higher revenue, demand forecast, causal price explanation, realized profit or execution claim remains.

Root and independent complete narrative reviews bind SHA256 `9130f478d5bf1cc3ca4c8b5448acf0cb4339ae1fb0fe800eb41df9f9764f5b83`. Investigation `3172a0d8-70ec-4342-833d-f1932bd7ae0f` was launched through authenticated HTTP and published **after review through the actual UI**. Finding `285d2a9c-876c-47d6-8690-dd7f2e3f827b` reached only original Workers1/2; their actual UI acknowledgments reached Master with scoped references. Worker3 received no copy. Acknowledgment executes no business action.

The first finalizer published/acknowledged successfully but its read-only browser phase attempted a second login in an already-authenticated context. The failed report is preserved. The toolkit-only page-reuse correction resumed the same finding using recorded action provenance, without another publication or acknowledgment, and passed. A separate browser inspection passed. Original model configuration was restored, its own alias unloaded and model definitions unchanged.

## Retained failures and limitations

- Original NativeFinal automatic PASS is overridden by its failed manual narrative review. The canonical deterministic finding from that old case was independently correct and remains retained; it is distinct from the rejected model narrative. Other failed native/probe, migration/build, clean-install and helper attempts remain evidence, not green release results.
- Source leases expire. Master currently filters Catalog finding listings/receipts through current-source validation; after expiry, that current view hides the finding and closing/reissuing requires current evidence. Historical investigation/result and stored finding/receipts remain intact, and Workers retain their own acknowledgments. Final targeted read-only inspection verified this explicitly without renewal or policy changes. This is a known lifecycle/presentation limitation.
- Native prose identifies Synthetic entities and retains simulation purpose but does not separately spell out SYNTHETIC SIMULATION. Canonical Worker findings explicitly do. The recommendation is a conditional review suggestion, not evidence of commercial value or operational authority.
- One retained historical Printify connection reports `CONNECTOR_CONFIGURATION_OR_DATA_INVALID`; the existing active profile has a fresh successful catalog receipt. No profile was replaced to obtain success. Three original private connector files, identities/configuration and disabled-production flags are unchanged.
- Real provider validation is **read-only catalog connectivity**, not paid orders, production, shipping or live end-to-end commerce compatibility. Synthetic commerce and deterministic calculations do not establish commercial production readiness.
- The local model remains nondeterministic and may fail safely. Explicit protocol fixtures provide reproducible regression coverage; they are not real-model quality evidence.
- Secret scans cover selected known credentials, current source/toolkit/public evidence and generic token/key patterns. They are not an exhaustive Git-history or image-layer secret audit; screenshot byte scans do not perform OCR.
- Full offline enrollment and Phase16–18 automation/adapters/marketing remain deferred. No new core UI renderer or competing module architecture was introduced.

## Exact verification and release commands

Run from the repository root; credentials remain in existing private installation files. Existing installation/upgrade recovery details are in `phase15-release.md`; demo and explicit review instructions are in `phase15-demo.md`.

```powershell
npm run build
npm test
node scripts/test-phase15-source-migrations.mjs --committed --catalog .steward/phase8-upgrade-regressions/modules/public/catalog.json --trust .steward/phase8-upgrade-regressions/modules/public/trust.json
node scripts/build-release-images.mjs 0.15.0
node scripts/release.mjs pack --version 0.15.0 --candidate --directory .steward/phase8-upgrade-regressions --bundle artifacts/releases/steward-0.15.0-candidate-4c07ffb
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.15.0-candidate-4c07ffb
node scripts/upgrade-phase15-selected.mjs .steward/phase8-upgrade-regressions artifacts/releases/steward-0.15.0-candidate-4c07ffb
node scripts/verify-phase15-clean-installation.mjs --execute-authorized --bundle artifacts/releases/steward-0.15.0-candidate-4c07ffb --network-prefix 10.217
node scripts/verify-phase15-live-catalog.mjs --execute-authorized --report artifacts/phase15j-live-catalog-final.json
npm run test:scientific
npm run test:scientific:governance
npm run test:economy:science
npm run test:scientific:presentation
node scripts/smoke.mjs .steward/phase8-upgrade-regressions
node scripts/verify-single-stack.mjs
```

These are the executed commands, not permission to overwrite retained candidate directories or reuse an allocated clean-test network. Choose new output paths/network for a separately authorized fresh acceptance; preserve completed records and artifacts. The native deferred/finalization commands and exact inputs are recorded in the retained logs/reports. Release promotion and `v0.15.0` tagging must occur only after evidence-archive integrity and all mandatory gates pass. No branch or tag is pushed.

## Evidence archive and gate reconciliation

All eighteen mandatory gates are recorded passed in `phase15-release-gates.json`, bound to the exact built candidate manifest. `artifacts/releases/steward-0.15.0-evidence-4c07ffb.zip` contains146 explicitly selected public evidence files plus a manifest. SHA256: `670f60bb64a92762bcca8ad5df03edfafd070032e2f46d98fa2edc8699b04de1`. Extraction verified every byte count/hash and rejected unexpected paths. The147 extracted files were scanned against55 known selected/clean-install secrets plus generic key/token patterns: zero matches, private paths or unreviewed credential literals. The archive is a pre-promotion evidence snapshot; final gates and the accepted release manifest are separately committed records. No private backups/deployments are included.

## Release closure

The exact candidate was promoted to **accepted0.15.0** with payload checksums and image IDs unchanged. Acceptance evidence commit: `6dbcbb8fd2b2c8b35c7e12bd72445487b9d43d83`; built application/toolkit source remains `4c07ffb0980e891f917f1755ff380e4241219f40`. Accepted redeployment passed all eight preservation checks again, retaining44 module databases,666 tables,159 private files and7 volumes. The selected installation marker matches the accepted manifest SHA256; final release verification passed. See `artifacts/phase15j-release-closure.json` and `phase15j-accepted-redeployment.json`. The local `v0.15.0` tag resolves the final documentation commit. No branch or tag was pushed.
