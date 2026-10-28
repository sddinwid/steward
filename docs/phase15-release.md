# Phase 15 candidate installation and recovery

Phase 15 remains a candidate until every mandatory gate in `phase15-release-gates.json` passes. Do not promote or tag an incomplete candidate.

## Build and verify

Run from a clean committed repository checkout after `npm ci` and `npm run build`:

```powershell
node scripts/test-phase15-source-migrations.mjs --committed --catalog <deployment>/modules/public/catalog.json --trust <deployment>/modules/public/trust.json
node scripts/build-release-images.mjs 0.15.0
node scripts/release.mjs pack --version 0.15.0 --candidate --directory <deployment> --bundle <new-candidate-directory>
node scripts/release.mjs verify --bundle <new-candidate-directory>
```

Publish the exact new module versions listed in `phase15-module-versions.json` before packaging, using `node scripts/publish-module.mjs modules/<name> <deployment>`. Reuse existing trusted immutable packages. Assets and Operations retain their original signed legacy migration declarations; do not republish their unchanged source manifests. Candidate images include the full source commit in their tags. Existing image/version identities cannot be overwritten.

## Selected in-place upgrade

```powershell
node scripts/verify-single-stack.mjs
node scripts/upgrade-phase15-selected.mjs <selected-deployment> --snapshot-only
node scripts/upgrade-phase15-selected.mjs <selected-deployment> <verified-candidate-directory>
node scripts/smoke.mjs <selected-deployment>
```

Snapshot-only mode queries PostgreSQL with default transactions read-only, reads files and Docker metadata, and writes a private comparison snapshot under `.steward/phase15-upgrade-audit`. It does not provision, start containers or modify database rows. It is not a database backup.

The deployment-changing path uses the existing release installer. Before selecting new images it saves the complete private deployment configuration, operator selection and workspace environment, and `pg_dumpall` for each of the four original PostgreSQL servers under `<selected-deployment>.backups/release-0.15.0-<timestamp>`. Those dumps include authoritative module databases and database roles. Keep this directory private; never add it to Git or the public release archive. A failed backup stops the upgrade. PostgreSQL remains the original 17.9 image.

The core upgrade appends schema 19 and adds Catalog API routing. It does not upgrade any installed module. Verification checks original migration ancestry, core identity/authority tables, module records, old signed catalog entries, private files, volumes, selection and exact running image IDs. The generic Module Manager installs new modules separately. Existing providers with outstanding obligations remain at their original package/installation pins.

## Recovery boundaries

If any step fails, retain the backup and both private comparison snapshots. Inspect the failure before further writes. Re-running the same pinned release startup is safe for a transient readiness failure; do not erase volumes or edit applied SQL.

An older platform image cannot safely read the new schema merely by changing an image tag. Recovery to the old release requires restoring the complete matching configuration and PostgreSQL dumps into an isolated recovery deployment, verifying its identities and records, and explicitly selecting it after stopping the failed deployment. Preserve the original volumes for investigation. Do not restore old dumps over a running installation or silently discard business writes made after the backup. Clean-installation acceptance separately tests dump restoration into an isolated scratch database.

## Connector image approvals

After the core upgrade, inspect the exact trusted target package and actual migration ancestry. For an already approved live connector, use the existing operator CLI:

```powershell
node scripts/configure-connector-egress.mjs --directory <selected-deployment> --worker worker-3 --module cee.shopify --upgrade-package cee.shopify@1.3.0 --expected-image <verified-image-sha256>
```

Use the corresponding Printify package for Printify. This mode retains the existing bridge and scope, checks the installed runtime/image and signed migration prefix, and backs up the host configuration. It cannot create a network, change a subnet, downgrade a provider or approve an untrusted image. Complete the reviewed Module Manager upgrade immediately afterward with the original module configuration. Credentials and profiles remain in their existing per-module private files. Keep production disabled and live connector verification read-only. An unavailable historical profile remains preserved and reported separately from a new failure.

## Final release

The acceptance report must identify the exact candidate manifest checksum, image IDs, source commit, signed module versions and completed gates. Only then use the gated `release.mjs promote` operation and create `v0.15.0`. The final operator must be the original selected deployment with one running stack.
