# Phase 3 module operations and SDK

Platform `0.3.0` introduces a generic Worker module runtime. Inventory `cee.inventory@1.0.0` is a separate source package, OCI image and signed descriptor. It is outside the root npm workspace and absent from Worker API images and frontend bundles. There are no default accounts or preinstalled business modules. Existing installation format v1, security overlay, identities and databases remain valid.

## Start or upgrade

Requirements: Node 24.x, npm 10+, Linux Docker Engine supporting API 1.51 and named-volume subpaths (verified on Docker Desktop), Compose, and OpenSSL used by the existing security provisioner. Run from the repository root:

```powershell
npm ci
npm run build
npm run build:inventory
npm test
npm run provision
npm run security:provision
npm run modules:provision
node scripts/compose.mjs config --quiet
npm run dev:up
npm run smoke
```

`build:inventory` builds and tests the separate TypeScript package locally; it neither publishes nor installs it. `dev:up` builds the generic 0.3.0 platform and provider images. An existing 0.2.0 deployment needs this one platform upgrade to acquire the runtime; subsequent module installations do not rebuild or replace Worker API/web containers. Base/security provisioning preserves existing files; the module provisioner adds a separate overlay, public catalog, per-Worker provider configuration and durable volumes. Reruns preserve their contents. No module service is in Compose.

Trust the private development CA in your browser using the Phase 2 procedure. Use the existing [local administrator bootstrap](phase2.md) or create a new Worker-local account:

```powershell
node scripts/create-account.mjs worker-1 operator local_admin --generate-password-file .steward/dev/security/worker-1-operator-password
```

Read that file privately. Never reuse a Master administrator password on a Worker.

## Publish and install Inventory into a running Worker

First verify there is no installed Inventory, module API or navigation. Capture core identities before publishing:

```powershell
node scripts/compose.mjs images
node scripts/compose.mjs ps
npm run modules:publish
```

`modules:publish` builds only `modules/inventory/Dockerfile`, hashes the real migration SQL, inspects the immutable local Docker image ID, signs its descriptor with the operator publisher key and adds it to the public catalog. It does not restart a Worker. Explicit alternative:

```powershell
node scripts/publish-module.mjs modules/inventory .steward/dev
```

Open [Worker 1](https://worker-1.localhost:6201), sign in with its local administrator and select **Refresh modules**. Inspect **Package details** and its compatibility, image identity, permissions, schema and migration hashes. Set configuration, for example `{"quantityUnit":"pieces"}`. Choose **Install Inventory**, then **Activate Inventory**. Select **Inventory** under module navigation. Create/edit a SKU, name and nonnegative quantity (up to three decimal places). Records and optimistic revision checks are implemented by the separately running service, with real PostgreSQL persistence.

Worker 2 stays unchanged until its own administrator installs a module. [Worker 3](https://worker-3.localhost:6203) can install the same package later, for example with `{"quantityUnit":"boxes"}`. Each module receives a distinct database, role, secrets and container within its Worker's deployment. The same image is reused; no company/entity identifiers are compiled into Inventory.

**Deactivate Inventory** stops its container and rejects its API while retaining its database and configuration. Reactivation restores access. A failed installation shows a persistent error code; the manager exposes **Recover** for an explicit retry/corrected trusted package. There is no uninstall, automatic destructive rollback or active upgrade operation in this release.

## Shutdown, restart and reset

Use the repository wrapper, including for down/reset, because module containers are created dynamically:

```powershell
npm run dev:down
node scripts/compose.mjs up -d --wait --wait-timeout 180
```

Down stops providers first and removes only disposable module containers bearing both the managed-by label and this deployment's installation IDs, then performs Compose teardown. Databases, secret volumes, desired activation and local enrollment persist. On startup, each provider verifies the retained signed descriptor/image and recreates missing containers; active modules resume without Master login. Failed/interrupted installs require explicit recovery. `node scripts/compose.mjs stop` also stops module containers without removing them. Direct `docker compose down` bypasses dynamic container handling and is unsupported.

For an intentional destructive database/module-state reset, use `node scripts/compose.mjs down --volumes` before restarting. This deletes all PostgreSQL and module-secret volumes. For a complete identity reset, follow the path-checked removal commands in the README, adding `npm run modules:provision` after security provisioning. Do not delete keys/configuration while retaining old databases. Reset is not a module rollback or recovery procedure.

## Package format and extension interface

`@steward/module-sdk` v1.0.0 is a versioned shared package. A catalog contains `{catalogVersion:1,packages:[{payload,signature}]}`. The payload contains `formatVersion`, `publisherId`, immutable `imageId` (`sha256:...`) and a manifest. Ed25519 signs canonical JSON with sorted object keys; arrays preserve order. The descriptor binds all of:

- Manifest/SDK version, globally namespaced module ID, stable `major.minor.patch` version, name, description and minimum platform version.
- Dependencies with minimum versions; they must be active. Active dependents block deactivation of a dependency.
- Required core permissions: v1 permits only `storage.own-database`.
- Declared API operations (GET/POST/PUT, closed paths including optional UUID `:id`, module-scoped permission names).
- Declarative UI screens, navigation, list/create/update operation references, fields and columns. These descriptors are discovered after activation. No module JavaScript, iframe, remote assets, HTML or script URLs are loaded.
- Closed JSON configuration schema, validated before any provisioning.
- Dedicated database requirement, ordered migration versions and SHA-256 checksums, schema version, `destructiveRollback:false`.
- Versioned integration event and analytical capability declarations. Inventory declares neither; this phase does not implement event delivery, analytics or MCP.

See `modules/inventory/manifest.json` for the authoring template; its empty migration array is deliberately filled from actual SQL by the publisher and is not itself an installable descriptor. Published module versions are immutable: changed code/SQL/manifest/configuration contracts require a new version. Docker image labels must agree with the signed module ID/version. The initial provider resolves only preloaded local images; registry distribution, registry credentials, publisher rotation UI and automated image pulling are not implemented. For another host, transfer the exact image with `docker save`/`docker load`, verify its image ID, and provision a reviewed publisher trust/catalog through the operator's deployment process. Do not blindly trust a supplied catalog or publisher key.

A service listens on internal port 8080, exposes public process `/health`, gateway-authenticated `/ready` and `POST /internal/migrate`, and implements only its declared application paths. It reads `/run/module-secrets/runtime.json`, `db-password` and `gateway-token`. Migrations must be transactional and checksum-verified; Inventory provides that implementation. The generic host cannot guarantee arbitrary publisher SQL is safe: trusted publishers are code suppliers, not untrusted tenants. Configuration is nonsecret and visible to local administrators; v1 has no module secret-input facility. Never put passwords/private keys in module configuration.

## Authorization and runtime security

All v3 routes exist only on the Worker's TLS listener. Same-origin Secure/HttpOnly/SameSite sessions and CSRF checks reuse Phase 2 authentication. Only `local_admin` can inspect/administer packages, lifecycle or grants. Master roles do not authorize Worker administration. Create limited local users with the same account tool and role `module_user`, then use **Module user permissions** to grant declared read/write permissions. Authorization is enforced on each gateway API operation independently of UI discovery; it is checked again by the provider. A read-only user's UI omits write actions. Host-only sessions cannot be reused across Workers.

Worker-to-provider control requests use the Worker's existing Ed25519 identity, protocol/installation binding, fresh nonces, a 60-second timestamp window and durable replay records. TLS validates the development CA and pinned installation server name. Production retains the reviewed Phase 2 CA/hostname/signing-key trust model. No Worker frontend, API response or log receives gateway tokens, module database passwords, private signing keys or Master administrator credentials.

The provider is an infrastructure authority: **its Docker socket grants host-root-equivalent control**, and it holds only its own Worker's PostgreSQL administrative credential. It has no host port, requires signed Worker control requests and is separate from the unprivileged Worker API. Running this provider on a shared production daemon is a material trust boundary, not a security sandbox. Deploy on a dedicated trusted Worker host or replace the provider with a constrained orchestration API before a multi-tenant production rollout. Read-only root/capability restrictions do not diminish Docker socket authority.

Module containers have a nonroot UID, read-only root, dropped capabilities, no-new-privileges, memory/PID limits, no host port, no Docker socket, only their own read-only secret-volume subpath, and only their Worker module/database networks. They do not receive core database, identity, session or Master credentials. Their role owns only their dedicated database, and PUBLIC connect to both core/module databases is revoked. The local container network carries gateway-token-authenticated traffic; production across hosts needs transport encryption/service identity for that link. Development Docker networks are trusted single-host infrastructure.

## Concurrency, persistence and recovery

Core PostgreSQL advisory locks serialize installation/lifecycle per module. The provider uses independent exclusive locks for lifecycle and shared locks for API traffic. UUID operation IDs, unique module records, immutable image checks, resource ownership labels and stable generated database/secret names prevent duplicate installations. Identical completed retries return existing state; incompatible configuration/package retries conflict. Interrupted/failed installation records retain their descriptor, operation ID and error. No recovery path drops a database, resets existing secrets, or runs down migrations.

Inventory applies all pending SQL and migration journal entries in one transaction, verifies existing checksums and binds the database to both installation and module identity. Failed SQL rolls back only that uncommitted transaction. Existing data/applied schema remain. A corrected signed version may be explicitly installed to recover a failed/interrupted attempt. Changed applied migration checksums are rejected. Back up module databases and provider volumes together; configuration/identity recovery is an operator responsibility. Active package upgrades and automatic backup/restore are outside Phase 3.

## Automated verification

```powershell
npm run build
npm run build:inventory
npm test
npm run smoke
npx playwright install chromium
npm run verify:phase2
npm run verify:phase3
node scripts/verify-module-restart.mjs
node scripts/verify-module-provision.mjs
node scripts/verify-module-secrets.mjs
npm run verify:isolation
node scripts/browser-smoke.mjs
```

`verify:phase3` requires the private accounts/entity fixtures generated by `verify:phase2` in this development deployment. For a fresh demonstration, run Phase 3 verification before manual publication/installation: it records absence on all three Workers, publishes only the separate module, installs/activates through Chromium, creates and edits actual records, and compares image IDs, container IDs and start times. Reruns retain initial absence evidence, reuse persisted modules and repeat operations. It tests concurrency, API/user isolation, untrusted/incompatible packages, failed real SQL migration with corrected-package recovery, deactivation, restarts, and Master outage CRUD. Its signed migration-check packages are explicitly test fixtures, retained disabled on Worker 1; they are not shipped application modules. Do not run this destructive-availability verification on production.

Generated evidence and screenshots are under ignored `artifacts/`. Exact observed outcomes and limitations are in [Phase 3 verification](phase3-verification.md). Historical Phase 1/2 reports remain unchanged.
