# Steward MVP release 0.6.0

This release packages the verified Phase 5B applications (platform compatibility 0.5.0, schema 6). Master and Worker have separate distribution manifests and images. All Workers use identical API, frontend and module-host image IDs. Inventory 1.2.1 and Operations 1.0.0 remain independent module images; shipping them does not install them into a Worker.

## Prerequisites

Node 24, npm 10+, Docker Engine with Linux containers and Compose supporting `!reset` (2.24.4+), OpenSSL, and sufficient disk space for the image archive and PostgreSQL volumes. On Windows the existing provisioner uses Git for Windows OpenSSL; set `STEWARD_OPENSSL` to another executable if required. Local development ports 4100, 4201–4203, 5100, 5201–5203, 6100 and 6201–6203 must be free. Only one default-port deployment can run at a time. Do not delete another project's volumes to free these ports.

For browser verification: `npx playwright install chromium`. For AI: running Ollama at host loopback port 11434 with `qwen2.5:7b` already installed. Model download is an operator action, not a side effect of running the demo.

## Build a distribution from the verified development deployment

From the repository root, after normal build, tests and core/module image publication:

```powershell
npm ci
npm run build
npm test
node scripts/release.mjs pack --bundle artifacts/releases/steward-0.6.0
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.6.0
Get-FileHash artifacts/releases/steward-0.6.0/release.json -Algorithm SHA256
```

`pack` reads current `steward-*-*:0.5.0` application images and the configured signed catalog under `.steward/dev`. It verifies source module signatures and refuses replacement of a version tag with different content. Use `--directory` for another already-verified source deployment. Distribute the **whole** release directory: `release.json`, role manifests, `module-packages.json`, `images.tar` and `toolkit`. It contains no deployment directory, passwords, certificates, local CA keys, private module publisher keys or model weights. Image archive and generated installation directories are intentionally ignored by Git; the acceptance report records their hashes. The source toolkit and packaging commands are committed. The post-packaging `steward-0.6.0-verification.json` report accompanies the release as a separate sidecar; its repository copy is `docs/phase6-verification-evidence.json`. This avoids a self-referential checksum. Obtain report and manifest provenance through the same trusted channel.

## Install from a copied release directory

Obtain and compare `release.json`'s SHA-256 using a trusted channel. Checksums alone do not authenticate a release publisher. These commands use relative paths from any location; no source checkout or developer home path is required:

```powershell
cd steward-0.6.0/toolkit
npm ci
npm run build
node scripts/release.mjs verify --bundle ..
node scripts/release.mjs install --bundle .. --directory ../../steward-demo --project steward-demo --trust-bundled-modules
node scripts/release.mjs start --directory ../../steward-demo
node scripts/release.mjs status --directory ../../steward-demo
```

`--trust-bundled-modules` is explicit operator approval of the checked release's Inventory and Operations payloads. Installation signs these immutable payloads with this deployment's existing/private publisher key and publishes them to its catalog. Installation never activates a business module or enrolls a Worker. Config generation is resumable and refuses incompatible topology or identity changes. Re-running the exact install command preserves existing configuration and data. A crash leaves a `.release-lock`; verify no installer is running before removing only that empty lock directory and retrying.

`--mode master` installs Master only. `--mode worker --workers 3 --trust PATH_TO_PUBLIC_MASTER_TRUST_BUNDLE` creates independent Worker applications with the existing provisioning trust contract. Configure/review routable API/browser URLs, CA and Master signing identity in that public trust bundle before initial provisioning. The combined local demo uses the generated reviewed local Master profile. Remote-host deployment and certificate lifecycle are not acceptance-tested in this release.

Generated bind mount paths resolve the operator's selected toolkit and deployment directories at installation. Keep both directories at those paths; a relocation of an existing installation requires operator-reviewed mount changes. Shipped files contain no developer-specific runtime paths. npm registry access/cache is needed for toolkit dependencies; the core/module/PostgreSQL image payloads do not need a registry during deployment. This is not a completely air-gapped installer.

## Upgrade / redeploy / stop

Take and verify PostgreSQL backups plus a private deployment-directory backup before a production-data upgrade. Retain the previous release archive and its manifest digest. Stop only this deployment using the wrapper, which stops module hosts before their child containers:

```powershell
node scripts/release.mjs stop --directory ../../steward-demo
node scripts/release.mjs upgrade --bundle .. --directory ../../steward-demo --trust-bundled-modules
node scripts/release.mjs start --directory ../../steward-demo
node scripts/smoke.mjs ../../steward-demo
```

Upgrade selects digest-pinned images in `DEPLOYMENT/release/compose.yaml`; it never rewrites base installation identities or credentials and never drops volumes. A previous different overlay is retained as `previous-compose.yaml`. Application readiness enforces schema/installation identity. If selection or readiness fails, preserve logs and all volumes, correct the image/trust/config issue and retry. This release changes no application schema. Future releases with migrations require an explicit forward-recovery plan; do not blindly start an older binary against a newer schema or perform destructive SQL rollback.

`stop` removes this project's containers/networks and retains all databases, module state and configuration. `start` recreates them using the exact selected images with `--no-build`. Do not use `down -v` as a recovery procedure. Synthetic data restoration is `demo.mjs … reset`, described in the presenter guide; it does not erase installations.

Once selected, the release overlay also applies to the ordinary Compose wrapper: `dev:up --build` continues using the pinned release instead of silently rebuilding it. Use a separate source-based deployment for application development. The release's `includesWorkingTreeChanges` flag and per-file checksums identify whether the packaging source included changes after its recorded base commit.

## Security and production limits

This is an MVP distribution for the documented local trust model. Existing authorization, per-entity enrollment, request replay controls, Worker-local module permissions and isolated databases remain in force. The module-host Docker socket remains a privileged deployment boundary. Local CA issuance, secret ACLs, dependency provenance, host backup/restore, TLS outside the private Compose networks, security monitoring, HA, certificate/key rotation, restore drills and sustained load testing require production work. No cloud-provider validation, offline enrollment workflow, or commercial production readiness is claimed.
