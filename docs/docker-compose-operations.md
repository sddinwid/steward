# Running the installed application with Docker Compose

From the repository root, routine operation is now:

```powershell
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
```

`down` without `-v` releases the containers' memory while retaining database and module-state volumes. `up -d --build --wait` also works. Installed releases use pinned images, so `--build` does not replace them with a partial source build. First-time installation and explicit release upgrades remain separate provisioning operations.

## Select an existing deployment once

On this workspace the existing v0.9.1 preview is already selected. Its sign-in URLs are:

- Master: **https://master.localhost:26100**
- Worker 1: **https://worker-1.localhost:26201**
- Workers 2 and 3: **https://worker-2.localhost:26202**, **https://worker-3.localhost:26203**

These are the existing accounts and credentials, not a newly initialized installation. HTTP ports remain local runtime diagnostics; use the HTTPS URLs for sign-in.

For another checkout, or to intentionally select another installed deployment:

```powershell
node scripts/select-deployment.mjs PATH_TO_EXISTING_DEPLOYMENT
docker compose up -d --wait
```

Selection generates a private Compose definition under `.steward/operator` and writes only non-secret selection settings to the ignored root `.env`. It merges the existing security, networking, module, data, analyst, commerce and release overlays, retaining the original project and explicit resource names. It does not provision databases, create users, reset passwords, enroll Workers or change installed modules. Missing selection or missing security/release configuration produces an error rather than starting an unsecured foundation.

Repeat selection after an explicit release upgrade, so the root entry point picks up the new release's pinned images and deployment overlays. Only one deployment is selected by the root entry point; historical test deployments are not all restarted. Do not override the selected project with `-p` to create a second copy of the same installation.

## Installed module lifecycle

Modules remain independently packaged services created dynamically by the existing Worker module host. They are not hardcoded Compose services or compiled into Worker core. `docker compose ps` lists the core services; module containers may appear separately in Docker Desktop.

The selected operator definition adds a Compose `pre_stop` hook to each module host. On `docker compose stop`/`down`, it verifies installation/manager ownership and stops/removes only that installation's disposable module containers. It never deletes data volumes or changes desired module activation. The existing host restores active modules from signed descriptors and persistent state on the next `up`.

Compose hooks require a current Docker Compose version (the actual trial used v5.6.0). Individual Docker Desktop container stops or forced kills do not execute Compose hooks; use the Compose commands above for a complete planned shutdown. This operator-only lifecycle does not change module-host behavior in the existing release/fault-injection overlays.

## Verification

```powershell
node --test scripts/test-compose-operator.mjs
node scripts/verify-compose-operator.mjs PATH_TO_SELECTED_DEPLOYMENT
node scripts/verify-workspace-catalog.mjs PATH_TO_SELECTED_DEPLOYMENT
```

The lifecycle verifier actually shuts down and recreates the selected stack, so run it on a quiescent development installation. It checks all named volumes, all associated containers including dynamic modules, private-file hashes, account/password hashes, installation/enrollment identities, module state/configuration, protected business/evidence tables, health/readiness and ordinary Compose `ps`/`logs`. It creates its own artifact output directory.

### Actual repair validation — 24 October 2026

The existing `steward-phase8-upgrade-reg` installation was selected, not recreated. Direct `docker compose up -d --build --wait` passed. A full direct `down` / `up` cycle stopped all 24 associated containers, retained every named volume, restored all 24 containers and preserved every compared private-file and protected database hash. Ordinary `ps` and `logs` passed. Missing local selection was explicitly rejected. Four automated ownership/security/lifecycle tests passed, and 37 Chromium login/catalog/deep-link checks passed across Master and all three Workers.

The accidental 12-container `steward-dev` foundation was stopped and removed without deleting volumes. Only the intended 24-container installation was left running. No other retained test installation was restarted; no passwords, identities or business records were reset. Raw local evidence: `artifacts/compose-operator-verification.json`, `compose-operator-verification.log`, `compose-operator-browser.log` and `compose-foundation-down.log`.

This is an operator-entry-point correction after v0.9.1. Existing release tags and archives remain unchanged. Future source release packages include the root Compose entry point alongside the selection and lifecycle scripts.
