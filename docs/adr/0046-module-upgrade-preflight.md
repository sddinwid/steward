# ADR 0046 — Fail closed before package-bound authority replacement

Status: accepted preventive guard; continuity execution deferred.

The Worker installation identity is stable. A module installation operation ID and exact signed package digest jointly identify a provider. Historical evidence, reservations and obligations retain that original identity. An upgrade request ID is not proof that those obligations may move.

Existing signed manifests declare capabilities and replication, but do not attest the absence or safe continuation of module-owned policies, reservations, uncertain submissions or publication approvals. Core governance tables cannot prove module-local safety. Reading arbitrary module business tables or accepting a previous package digest would violate the architecture.

Therefore any actual replacement of an existing module identity is blocked before mutation. Core preflight reports only local governance dependency categories; module-local categories remain explicitly unknown. Fresh installations, existing runtime reads, and exact bound same-package recovery remain supported, including legacy modules. Legacy upgrades are conservatively blocked too: absent metadata is not proof of no dependencies. There is no override or pretend approval token.

The same guard applies before the egress CLI changes an existing image approval and before Module Host replaces a retained package. A rejected request requires no rollback and cannot change publication state. Existing revocation semantics are untouched.

A future continuity mechanism requires a signed module-owned inspection/preparation contract; durable exact source/target/Worker/entity/configuration-bound review; quiescence of ticks and delivery across transition; atomic or journaled activation; original authority for old obligations; and fault-tested recovery. It must distinguish explicitly approved new work from continuation of old work. This crosses module SDK, module implementations, host lifecycle, and synchronization boundaries and is beyond this bounded preventive correction. No operator deployment or UI-package upgrade will be attempted in this increment.
