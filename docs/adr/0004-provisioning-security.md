# ADR 0004 — Atomic versioned provisioning and a local security boundary

Status: accepted. Date: 2026-10-22.

Provisioner format v1 creates a complete deployment in a sibling staging directory and renames it into place under an exclusive sibling lock. It generates independent cryptographically random app/admin credentials and UUID identities once. An existing deployment is validated and preserved byte for byte; topology/release mismatch, missing secrets, and corrupt configuration fail closed. It does not perform enrollment, destructive reset, password rotation, or upgrades.

The Compose development environment binds only to host loopback, isolates each installation's networks, omits database host ports, mounts configuration read-only, and uses non-root application images with dropped capabilities and read-only filesystems. PostgreSQL passwords are supplied through [Compose secret files](https://docs.docker.com/compose/how-tos/use-secrets/), never plaintext Compose environment entries or baked images. Private 0700 host directories contain 0444 secret files: the host directory protects traversal, while the individually mounted files are readable by the API and PostgreSQL's distinct UIDs. This accounts for Compose not remapping file-backed secret ownership. This local file mechanism does not encrypt secrets at rest; Windows ACLs and operator-controlled backups remain necessary.

Direct API defaults are loopback binding and verified PostgreSQL TLS with an explicit CA. Local Compose explicitly disables database TLS inside isolated development networks. Public ingress TLS, endpoint authentication, authorization, managed secrets, and production recovery are not delivered in this phase. Only local health/readiness and platform identity/status reads exist. Authentication for enrollment must be implemented before an enrollment endpoint is added.

Dependencies are pinned by npm lockfile, base images by version tag. Tags are not immutable digests: a production release process must pin digests, scan/sign images, and establish upgrade/rollback/backup policy. Provisioner v1 and release 0.1.0 are deliberately conservative foundations rather than a production installer.
