# Phase 2 — Registration and enrollment operations

## Startup and upgrade

Requirements: Phase 1's Node 24/npm/Docker setup plus OpenSSL. On Windows the security provisioner defaults to Git for Windows' `C:/Program Files/Git/usr/bin/openssl.exe`; on POSIX it uses `openssl` from PATH. Override with `STEWARD_OPENSSL` when necessary. The provisioner supplies its own minimal OpenSSL configuration and does not depend on a machine-wide `OPENSSL_CONF` setting.

From the repository root, for a new or existing default development deployment:

```powershell
npm ci
npm run build
npm test
npm run provision
npm run security:provision
node scripts/compose.mjs config --quiet
npm run dev:up
npm run smoke
```

Migration 1, configuration v1, original installation IDs/entity IDs, base Compose, credentials, and volume names are preserved. Startup applies additive migration 2 transactionally. Back up existing operational databases before an upgrade. **Do not start a Phase 1-only image against schema 2:** it correctly refuses the newer schema. There is no destructive downgrade tool.

The security directory contains a private development CA key, CA certificate, per-installation TLS/Ed25519 identity keys, trust/configuration files, and an additive Compose overlay. No enrollment or account creation occurs during provisioning. Existing keys/configuration are never silently replaced. Repeat `npm run provision` and `npm run security:provision` to validate/preserve the same deployment. Windows security provisioning restricts its security directory ACL to the current operator, SYSTEM, and Administrators; POSIX uses a private parent directory. Back up these keys with their databases.

Use the existing npm startup/shutdown commands after enabling security; they automatically add the overlay when present:

```powershell
npm run dev:up
npm run dev:down
node scripts/compose.mjs up -d --wait --wait-timeout 180
node scripts/compose.mjs ps
```

The explicit equivalent is:

```powershell
docker compose -f .steward/dev/compose.yaml -f .steward/dev/security/compose.yaml up --build -d --wait --wait-timeout 180
```

Plain `docker compose up` with only the base file does not activate the Phase 2 overlay. For a different deployment set `STEWARD_DEPLOYMENT` for the Compose/account wrappers, and pass its directory as the first positional argument to the provisioner and verification scripts.

## Browser trust and URLs

Trust `.steward/dev/security/ca-cert.pem` in a **dedicated development browser profile** using the browser's certificate settings. Verify the file came from your own provisioner. Never import an unreviewed remote CA, and never copy the CA private key to a Worker/runtime. Chromium resolves `*.localhost` to loopback; other browser/OS combinations may require explicit localhost host mappings.

| Installation | HTTPS administration | Preserved Phase 1 frontend / API |
| --- | --- | --- |
| Master | https://master.localhost:6100 | http://127.0.0.1:5100 / http://127.0.0.1:4100 |
| Worker 1 | https://worker-1.localhost:6201 | http://127.0.0.1:5201 / http://127.0.0.1:4201 |
| Worker 2 | https://worker-2.localhost:6202 | http://127.0.0.1:5202 / http://127.0.0.1:4202 |
| Worker 3 | https://worker-3.localhost:6203 | http://127.0.0.1:5203 / http://127.0.0.1:4203 |

Do not replace these distinct secure browser hosts with a shared `localhost` origin. Host-only cookies must remain isolated between Master and Workers. Phase 1 HTTP interfaces link to their secure administration origin; they never register sensitive v2 endpoints. Health/readiness remain local and unauthenticated.

## Create real administrator accounts

There are no default credentials. Create accounts using the operator-only CLI and random generated passwords stored in the private security directory:

```powershell
node scripts/create-account.mjs master steward-admin registry_admin --generate-password-file .steward/dev/security/master-admin-password
node scripts/create-account.mjs master enrollment-admin enrollment_admin --generate-password-file .steward/dev/security/enrollment-admin-password
node scripts/create-account.mjs worker-1 local-admin local_admin --generate-password-file .steward/dev/security/worker-1-admin-password
```

Use the equivalent Worker command for Worker 2 or 3. Read the generated password file privately in your editor/password manager to sign in. Passwords are not printed, passed as command-line arguments, committed, included in images, or stored in plaintext in PostgreSQL. To supply an operator-selected password instead, use `--password-file PATH`; passwords must be 16–256 characters. The helper passes the password on stdin to the in-container account CLI. Creation refuses duplicate usernames and mismatched local/Master roles. Account creation requires deployment/operator access and is audited; no unauthenticated bootstrap HTTP route exists.

The direct in-container CLI is `node packages/platform/dist/security/admin-cli.js --username NAME --role ROLE --password-stdin`, with the password piped securely on stdin. Supported Master roles: `registry_admin`, `enrollment_admin`, and `viewer`; Workers accept only `local_admin`. Account recovery, credential rotation, MFA, and role-management UI are outside this phase. To disable an account operationally, use a reviewed database administration change to set `security_accounts.enabled=false`; all sessions and future enrollment authorization checks then reject it.

## Register an entity and enroll

1. On Master's HTTPS page, sign in as a registry administrator. Create a legal entity with its UUID, legal name, classification, and enrollment eligibility. IDs are unique; names and classifications are editable data.
2. Under **Entity enrollment authorization**, grant the intended Master enrollment administrator an explicit scope for that entity. Grant the approving administrator scope as well. Registry role alone does not authorize enrollment.
3. On the Worker's HTTPS page, sign in with its **local** administrator account. Save an operator-installed trusted Master profile, then select **Begin enrollment**. The wizard displays a verification code and the Worker's installation ID/key fingerprint.
4. Follow **Authorize on Master Steward**. Master passwords are entered only on Master's HTTPS host. Compare the installation ID and key fingerprint, select an existing authorized legal entity, then request enrollment.
5. A scoped administrator reviews the request on Master and selects **Approve enrollment** or **Reject enrollment**. Phase 2 permits self-approval when that administrator has entity scope; separate-approver policy is not enforced.
6. The Worker automatically reconciles, verifies its key-bound grant/certificate, and persists enrollment in its own database. The local status shows `unenrolled`, `pending`, `enrolled`, `rejected`, or `expired`, with `connection_unavailable` as a separate connectivity overlay. During a Master outage, the underlying enrollment remains `enrolled` and local services continue. Failed/expired requests can be initiated again with a new request ID.

Authorization codes live fifteen minutes; approval grants live at most ten minutes and cannot outlive the active request's validity for initial redemption. Requests/proofs use synchronized system time. Enrollment retries reuse a stable request ID with a fresh nonce/timestamp/signature. A lost response is recoverable without duplicate enrollment; exact signed replay is rejected.

## Trust configuration and production model

`security/<installation>/security.json` defines the installation's distinct `publicOrigin`, TLS secret-file paths, identity-key secret-file path, and operator-installed `trustedMasters`. Each trusted Master profile includes `profileId`, HTTPS `apiUrl`, HTTPS `browserUrl`, expected `installationId`, Ed25519 `publicKey`, and `caFile`. The wizard selects a profile; it cannot enroll against a user-supplied untrusted URL.

For the bundled all-in-one development topology the provisioner creates these pins from the actual generated Master identity. A Worker-only installation can import a reviewed Master public trust bundle:

```powershell
node tools/installer/dist/security-cli.js .steward/worker-only C:/secure-transfer/master-trust.json
```

The bundle contains `profileId`, HTTPS `apiUrl`, HTTPS `browserUrl`, `installationId`, public signing `publicKey`, and `caCertificate`. The generated `.steward/dev/security/master-trust.json` is an example of this public format; its internal development URL is not suitable for a different host. An operator must review and set the reachable HTTPS API/browser origins in a transferred copy. A standalone Worker does not need a running Master to start. Replacing trust on an existing deployment requires an explicit reviewed configuration update and restart; the provisioner refuses to silently replace it.

Production must replace the development PKI/origins with reviewed CA-managed certificates and renewal, use distinct controlled HTTPS hostnames, securely distribute the initial Master CA/ID/signing-key pins, protect signing/Worker keys in an operator-restricted secrets system, synchronize clocks, and implement backup/recovery procedures. TLS certificate verification is never disabled by the runtime. Browser development tests alone use an isolated Chromium context accepting the generated private CA; the Node verification client and actual Worker always verify the CA and hostname.

Each API mounts only its own identity/TLS keys and configuration; Workers receive only public Master trust material. Neither the CA signing key nor Master signing private key is mounted into a Worker. Local passwords/sessions and Master passwords/sessions are isolated by separate databases and browser hosts. Signed grants/certificates travel only on the TLS proof-authenticated backchannel and are omitted from browser status/admin responses. Master outages never gate Worker liveness/readiness or startup certificate validation.

## Exact verification commands

```powershell
npm run build
npm test
npm run provision
npm run security:provision
npm run dev:up
npm run smoke
npm run verify:isolation
npx playwright install chromium
node scripts/browser-smoke.mjs
npm run verify:phase2
node scripts/compose.mjs ps
npm audit
```

Run the Phase 2 verifier only on the default development topology with three Workers. It creates strong random verification accounts and two legal entities, exercises actual browser registration/authorization/approval, checks adversarial API cases, creates/removes only its own ephemeral cryptographic test candidates, restarts Worker 1, stops/restores all Master services, and temporarily changes/restores Worker 3's expected Master identity to test pin rejection. It invalidates its verification sessions on completion. Fixture accounts/passwords are in ignored, private `security/verification.json`; no credentials are printed. On reruns it reuses its fixture configuration and already persisted Worker 1 enrollment, while exercising fresh negative requests and all restart/outage checks. Do not run it against a production database or replace its fixture identities with operational ones.

Browser screenshots and a machine-readable success record are written under ignored `artifacts/`. See [actual Phase 2 results](phase2-verification.md). The original [Phase 1 verification report](verification.md) remains an immutable historical record of the pre-change baseline.

## Reset and limits

Use `node scripts/compose.mjs down --volumes` only when intentionally deleting all development database contents. Retaining security keys/configuration permits clean reinitialization of the same installation identities, but accounts/entities/enrollment records will be gone. A complete fresh identity reset also removes only that deployment directory after a successful volume teardown; follow the guarded repository-root reset procedure in the README and provision both base and security again. No reset command runs during provisioning or ordinary verification.

Offline Worker-assisted enrollment, MCP, analytics, and durable event synchronization remain unimplemented. Signed grants reserve their future authorization format. Phase 2 does not implement certificate/key rotation, automatic enrollment revocation distribution, MFA/OIDC, password recovery, tamper-evident external audit storage, production PKI renewal, or multi-host orchestration. Native Linux/macOS deployment and ARM images have not been exercised in this Windows verification environment.
