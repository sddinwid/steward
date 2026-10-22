# Phase 2 actual verification

Verified: Thursday, October 22, 2026 at 10:41:25 AM PDT. Platform release 0.2.0, Windows/PowerShell, Node 24.13.0, npm 10.3.0, Docker Desktop 4.96.0, Linux containers, Compose 5.6.0. This report describes executed checks, not planned checks.

## Preflight baseline

Before changing source, inspected repository commit `faf25e8`, README, all four Phase 1 ADRs, the original verification report, application/core/provisioner source, and tests. The working tree was clean. Executed the Phase 1 build, all 8 original tests, provisioning rerun, smoke tests, isolation/persistence tests, and Chromium browser checks; every baseline check passed. Original configuration v1, installation IDs, database bindings, base Compose, volumes, and the historical Phase 1 report were preserved.

## Final commands and outcomes

| Command/check | Actual result |
| --- | --- |
| `npm ci` | Passed against the final lockfile; 109 packages audited on Windows; zero reported vulnerabilities |
| `npm run build` | Passed all eight workspaces: contracts, platform, UI, four applications, installer |
| `npm test` | 12 tests passed, 0 failed, 0 skipped (7 backend/crypto + 5 installer) |
| `npm run provision` | Existing four-installation 0.1.0 manifest/configuration preserved by the 0.2.0 provisioner |
| `npm run security:provision` | Created additive security overlay; repeat invocation preserved key/configuration contents and restricted Windows security-directory ACL |
| `node scripts/compose.mjs config --quiet` | Passed merged Compose validation |
| `npm run dev:up` | Built 0.2.0 Master/Worker API and web images; all 12 containers healthy |
| `npm run verify:phase2` | Passed complete TLS/API/Chromium scenario and all negative assertions; restored all services and invalidated verification sessions |
| `npm run smoke` | Passed all four APIs/frontends, proxies, schema 2, identity/volume isolation, restricted database roles, and identical Worker image IDs |
| `npm run verify:isolation` | Passed hash-preserving provisioning rerun, all-Worker availability with Master stopped, isolated database failure/recovery, persistent data, safe migration repeats, wrong-installation rejection |
| `node scripts/browser-smoke.mjs` | All four original HTTP frontends rendered correctly; no page errors; desktop/mobile captures and no horizontal overflow |
| `node scripts/create-account.mjs ...` | Generated a real random password privately, created a viewer via stdin, verified scrypt persistence; temporary check account disabled/password file removed afterward |
| Runtime secret mount inspection | Each API mounts only its own identity key; no runtime mounts the CA private key or another installation's identity key |
| Windows ACL inspection | Security directory restricted to operator, SYSTEM, Administrators; inherited broad workspace access removed |
| `npm audit` | Zero reported vulnerabilities |
| `git diff --check` | Passed; only local LF/CRLF advisory warnings |

## Required Phase 2 demonstrations

| Requirement | Observed evidence |
| --- | --- |
| Register legal entity | Chromium signed in to Master with a real registry account and saved entity `122c7c44-ef0f-41de-aa40-b8943811c84c` with legal name/classification/eligibility; second entity registered for negative scope checks |
| Authorized enrollment | Worker 1 wizard initiated a key-bound request; Master-hosted login selected its authorized entity, submitted it, and approved it through the administrative browser UI; Worker persisted verified enrollment |
| Unknown entity rejected | Master authorization POST for an unknown UUID returned HTTP 404 |
| Unauthorized account rejected | Unknown login returned 401; authenticated viewer entity management/enrollment/approval returned 403 |
| Entity scope enforced | Wrong-entity authorization and approval returned 403; entity selection omitted unauthorized entity; revocation prevented even a fresh signed redemption retry |
| Persistence after restart | Worker 1 API restart retained the exact database certificate and enrolled status without another Master login |
| Master outage independence | Stopped Master web/API/database; all Worker health/readiness remained 200; enrolled Worker displayed connection unavailable while retaining enrolled state; another Worker restart while Master was still stopped retained enrollment; automatic recovery after Master returned |
| Safe retries | Repeated local request ID, Master authorization, and fresh signed start/redemption retries did not create duplicate enrollment; repeated redemption returned the identical certificate; database count stayed one |
| Phase 1 preservation | All original tests retained/passed alongside new tests; complete build/provisioning/smoke/isolation/browser regression suite passed |

Additional negative checks passed: insecure HTTP sensitive route absent even with a spoofed forwarded-proto header; CSRF rejection; Secure/HttpOnly/SameSite cookie attributes; untrusted Master profile rejection; exact proof replay rejection; stale timestamp rejection; invalid signature rejection; duplicate installation ID with a different key rejection; public-key reuse across installation IDs rejection; wrong-entity grant redemption rejection; rejection persisted to Worker; wrong expected Master ID produced connection unavailable without enrollment; actual Worker TLS client rejected an untrusted CA. Unit tests also rejected expired/future/overlong grants, wrong issuer/audience/entity/key/request/capabilities, and altered signatures.

Administrative and Worker browser status responses omit private keys, enrollment grants, and certificates. Browser bundles and application logs were checked against the actual generated verification passwords and private-key markers; no matches. All secure-browser pages reported zero JavaScript page errors. Master-host-only cookies were not delivered to the Worker origin. The browser harness used an isolated development-CA allowance; Node and actual Worker TLS verification remained enabled throughout.

The fresh browser enrollment was exercised successfully during the initial end-to-end run. Subsequent complete runs reused the persisted enrolled Worker 1 fixture and repeated all fresh adversarial proof requests, scoped request/rejection checks, restart/outage tests, and browser validations. Machine-readable final success timestamp: `2026-10-22T17:38:27.788Z`.

## Final running state

| Installation | Enrollment state | Secure browser origin |
| --- | --- | --- |
| master | registry available | https://master.localhost:6100 |
| worker-1 | enrolled | https://worker-1.localhost:6201 |
| worker-2 | rejected | https://worker-2.localhost:6202 |
| worker-3 | unenrolled | https://worker-3.localhost:6203 |

All twelve containers were healthy when this report was captured. Worker operational databases/volumes remain separate. Worker images are identical across all three instances:

- API: `sha256:bd3f25e3dc3e62fec7bdb883df19b6903265d95027311e9541f7fcd350680f96`
- Frontend: `sha256:4c96f3fd816fa34885591c31f0f5a9a46aa4fe9cae058ff192e84e63a07615f6`

```text
NAME                         IMAGE                      COMMAND                  SERVICE        CREATED          STATUS                    PORTS
steward-dev-master-api-1     steward-master-api:0.2.0   "docker-entrypoint.s…"   master-api     4 minutes ago    Up 2 minutes (healthy)    127.0.0.1:4100->3000/tcp
steward-dev-master-db-1      postgres:17.9-alpine       "docker-entrypoint.s…"   master-db      48 minutes ago   Up 2 minutes (healthy)    5432/tcp
steward-dev-master-web-1     steward-master-web:0.2.0   "/docker-entrypoint.…"   master-web     21 minutes ago   Up 2 minutes (healthy)    127.0.0.1:5100->8080/tcp, 127.0.0.1:6100->8443/tcp
steward-dev-worker-1-api-1   steward-worker-api:0.2.0   "docker-entrypoint.s…"   worker-1-api   4 minutes ago    Up 3 minutes (healthy)    127.0.0.1:4201->3000/tcp
steward-dev-worker-1-db-1    postgres:17.9-alpine       "docker-entrypoint.s…"   worker-1-db    48 minutes ago   Up 2 minutes (healthy)    5432/tcp
steward-dev-worker-1-web-1   steward-worker-web:0.2.0   "/docker-entrypoint.…"   worker-1-web   21 minutes ago   Up 19 minutes (healthy)   127.0.0.1:5201->8080/tcp, 127.0.0.1:6201->8443/tcp
steward-dev-worker-2-api-1   steward-worker-api:0.2.0   "docker-entrypoint.s…"   worker-2-api   4 minutes ago    Up 4 minutes (healthy)    127.0.0.1:4202->3000/tcp
steward-dev-worker-2-db-1    postgres:17.9-alpine       "docker-entrypoint.s…"   worker-2-db    48 minutes ago   Up 48 minutes (healthy)   5432/tcp
steward-dev-worker-2-web-1   steward-worker-web:0.2.0   "/docker-entrypoint.…"   worker-2-web   21 minutes ago   Up 19 minutes (healthy)   127.0.0.1:5202->8080/tcp, 127.0.0.1:6202->8443/tcp
steward-dev-worker-3-api-1   steward-worker-api:0.2.0   "docker-entrypoint.s…"   worker-3-api   4 minutes ago    Up 2 minutes (healthy)    127.0.0.1:4203->3000/tcp
steward-dev-worker-3-db-1    postgres:17.9-alpine       "docker-entrypoint.s…"   worker-3-db    48 minutes ago   Up 47 minutes (healthy)   5432/tcp
steward-dev-worker-3-web-1   steward-worker-web:0.2.0   "/docker-entrypoint.…"   worker-3-web   21 minutes ago   Up 19 minutes (healthy)   127.0.0.1:5203->8080/tcp, 127.0.0.1:6203->8443/tcp
```

Verification fixture accounts use strong generated passwords in ignored, operator-private `.steward/dev/security/verification.json`. Passwords are not printed in this report. Sessions were invalidated at the end of verification. Create your own operational accounts using the [documented bootstrap commands](phase2.md); no default credentials or authentication bypass exists.

Screenshots were generated under ignored `artifacts/phase2-master-registry.png`, `phase2-enrolled-worker.png`, and `phase2-master-outage.png`; Master registry and enrolled Worker captures were visually inspected. Ephemeral proof-test candidates were removed. Legal-entity fixtures, Worker 1 enrollment, Worker 2 rejection history, verification accounts, and audit records remain for inspection. Worker 3's trust configuration was restored byte for byte after the pin-mismatch test.

## Practical limits

This validates single-host Windows Docker Desktop development deployment, not a production PKI rollout. Browser operators must trust their generated development CA in a dedicated profile. Runtime CA/hostname/identity/signing-key pins are verified; production origins/CA/certificate renewal, private secret distribution, synchronized clocks, and backups require operator configuration. Native Linux/macOS and ARM were not exercised. Destructive reset and production recovery procedures were not executed.

MFA/OIDC, account recovery/credential rotation, Worker key/certificate rotation, distributed revocation, mandatory dual approval, tamper-evident external audit storage, and multi-host orchestration are not implemented. Existing enrollment remains locally available during Master outage by design. Offline enrollment remains a versioned, signed, time-limited, key-bound grant contract only; the Worker-assisted offline workflow is not implemented. MCP, analytical services, modules, and durable event synchronization remain outside Phase 2.
