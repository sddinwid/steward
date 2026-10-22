# Phase 1 actual verification

Date: 2026-10-22 (America/Los_Angeles). Executed in this workspace on Windows/PowerShell with Node.js 24.13.0, npm 10.3.0, Docker Desktop 4.96.0, Docker Engine 29.9.1 (Linux containers), and Docker Compose 5.6.0.

## Commands and results

| Command / check | Actual result |
| --- | --- |
| `npm ci` | Passed; 109 packages audited on the host, zero vulnerabilities |
| `npm run build` | Passed for contracts, platform, UI, all four applications, and installer |
| `npm test` | Passed: 8 tests, 0 failures, 0 skipped (4 backend + 4 provisioner) |
| `npm audit` / `npm audit --omit=dev` | Both passed; zero reported vulnerabilities |
| `npm run provision` | Created four persistent installations; later reruns preserved files |
| `docker compose config --quiet` | Passed |
| `npm run dev:up` | Built the four final application images; all 12 containers healthy |
| `npm run smoke` | Passed for Master and all 3 Workers |
| `npm run verify:isolation` | Passed all persistence, outage, and migration assertions; restored all services |
| `npx playwright install chromium` | Installed the Chromium test browser successfully |
| `node scripts/browser-smoke.mjs` | All 4 React apps rendered their own identity and ready status; no page errors; desktop/mobile screenshots captured; no mobile horizontal overflow |
| Standalone Worker-only deployment | Provisioned, started, passed smoke checks without a Master service, then stopped |
| Standalone Master-only deployment | Provisioned, started, passed smoke checks without any Worker service, then stopped |

The default deployment was restored after standalone tests and outage tests. Standalone test configurations and volumes are retained under their separate projects; no standalone containers remain running. Browser screenshots are local ignored artifacts under `artifacts/`; Worker desktop and mobile screenshots were visually inspected.

## Required deployment assertions

- Master frontend returned HTTP 200 and rendered React; Master API health and readiness returned HTTP 200.
- Three Worker frontends each returned HTTP 200, loaded their assets, rendered React, and proxied to their own installation identity.
- Three Worker APIs each returned HTTP 200 for health/readiness with distinct persistent installation identities.
- All four installations use separate PostgreSQL servers and named volumes. Each local operational database is named `steward`, on a different server. Persisted installation IDs matched their individual configuration files, and migration version 1 was present.
- Each API's PostgreSQL principal is a non-superuser without server-wide database/role creation rights. Database containers have no host port bindings; each database network is internal and unreachable directly by its frontend. API containers run as `node` with read-only root filesystems.
- The test stopped Master frontend, API, and PostgreSQL and asserted all three Master services were stopped. Every Worker remained healthy, ready, and reachable through its own frontend proxy.
- Stopping Worker 1 PostgreSQL kept its API health at HTTP 200, changed only its readiness to HTTP 503, and left the other Workers ready. Restart restored readiness and retained its database probe row.
- Re-provisioning preserved the SHA-256 hash of every deployment file (including configuration and secrets) and all database probe rows. Unit tests also verified preservation of a manually edited entity display name.
- Real PostgreSQL migrations ran twice safely; attaching a mismatched installation ID was rejected and rolled back. Test probe tables were removed after successful restoration.
- All three Workers use the identical API image ID and identical frontend image ID below. Compose builds each release artifact once and reuses it for all instances.

Worker API image: `sha256:ac4193b3c488389b58d6eef2e4a9affa741291e01f63bff1591caf90ba35a45b`

Worker frontend image: `sha256:5adb54e1020d1857e0fde1c08d8379771c5f0305591327cc9d8dca5a89081b18`

## Final running services

```text
NAME                         IMAGE                      COMMAND                  SERVICE        CREATED              STATUS                        PORTS
steward-dev-master-api-1     steward-master-api:0.1.0   "docker-entrypoint.s…"   master-api     About a minute ago   Up About a minute (healthy)   127.0.0.1:4100->3000/tcp
steward-dev-master-db-1      postgres:17.9-alpine       "docker-entrypoint.s…"   master-db      5 minutes ago        Up About a minute (healthy)   5432/tcp
steward-dev-master-web-1     steward-master-web:0.1.0   "/docker-entrypoint.…"   master-web     5 minutes ago        Up 57 seconds (healthy)       127.0.0.1:5100->8080/tcp
steward-dev-worker-1-api-1   steward-worker-api:0.1.0   "docker-entrypoint.s…"   worker-1-api   About a minute ago   Up About a minute (healthy)   127.0.0.1:4201->3000/tcp
steward-dev-worker-1-db-1    postgres:17.9-alpine       "docker-entrypoint.s…"   worker-1-db    5 minutes ago        Up About a minute (healthy)   5432/tcp
steward-dev-worker-1-web-1   steward-worker-web:0.1.0   "/docker-entrypoint.…"   worker-1-web   3 minutes ago        Up 3 minutes (healthy)        127.0.0.1:5201->8080/tcp
steward-dev-worker-2-api-1   steward-worker-api:0.1.0   "docker-entrypoint.s…"   worker-2-api   About a minute ago   Up About a minute (healthy)   127.0.0.1:4202->3000/tcp
steward-dev-worker-2-db-1    postgres:17.9-alpine       "docker-entrypoint.s…"   worker-2-db    5 minutes ago        Up 5 minutes (healthy)        5432/tcp
steward-dev-worker-2-web-1   steward-worker-web:0.1.0   "/docker-entrypoint.…"   worker-2-web   3 minutes ago        Up 3 minutes (healthy)        127.0.0.1:5202->8080/tcp
steward-dev-worker-3-api-1   steward-worker-api:0.1.0   "docker-entrypoint.s…"   worker-3-api   About a minute ago   Up About a minute (healthy)   127.0.0.1:4203->3000/tcp
steward-dev-worker-3-db-1    postgres:17.9-alpine       "docker-entrypoint.s…"   worker-3-db    5 minutes ago        Up 5 minutes (healthy)        5432/tcp
steward-dev-worker-3-web-1   steward-worker-web:0.1.0   "/docker-entrypoint.…"   worker-3-web   3 minutes ago        Up 3 minutes (healthy)        127.0.0.1:5203->8080/tcp
```

## Scope and verification limits

This verifies a single-host development deployment on Windows Docker Desktop, not a production installation. Native Linux/macOS hosts, ARM images, public TLS ingress, production secret managers, backup/restore, credential rotation, remote upgrades, and multi-host deployments were not exercised. Windows secret files inherit the workspace ACL; the provisioner does not harden Windows ACLs. POSIX private-directory/file modes are implemented but were not validated on a native POSIX host. Destructive reset commands are documented but were not executed against the retained default deployment.

Local status/identity endpoints use unauthenticated HTTP on loopback. Module loading/installation, authenticated enrollment, MCP servers, AI/Python analytics, and durable event synchronization remain explicitly unimplemented; only contracts/interfaces and visible unavailable statuses exist. No simulated integrations or successful enrollment claims are present.
