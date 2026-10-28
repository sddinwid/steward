# Adding workflow-compatible capabilities

Use the existing signed module manifest, SSMA resolver and Worker governance.
There is no separate workflow plug-in transport, executable graph language or
model-authorized capability path. Legacy modules remain valid without workflow
metadata. See [workflow contracts](phase16-workflow-contracts.md) for exact limits.

1. Declare the provider capability, versioned contract and bounded input/output
   schemas in signed package metadata. Declare the real API operation and its
   permission, configuration prerequisites, retry semantics and idempotency rule.
   An operation name alone is not authorization.
2. Keep business validation and persistence inside the provider's dedicated
   module database. Bind retained obligations to their original installation and
   package. Receipt identities must distinguish a safe replay from changed terms.
3. Declare a matching consumer requirement. The resolver must discover a verified
   installed provider and produce compatible candidates. A local authorized human
   selects and approves the binding. Do not call an unregistered endpoint directly.
4. For events, declare the exact closed schema and use the existing authorized
   projection/outbox stream. Preserve source record identity, revision, entity,
   capture time and stream. Local capture and Master synchronization acknowledgments
   are separate; one must not consume the other's progress.
5. Contribute forms and navigation through the generic SSDS manifest renderer.
   The Workflow Designer is a data-only field renderer using the browser-safe
   `@steward/module-sdk/workflow` export. Do not load module JavaScript or replace
   the extensible renderer with a business-specific core screen.
6. Test signed compatibility, actor/CSRF/entity boundaries, changed configuration,
   duplicate requests, lost responses, restarts and substitution. Mark retries safe
   only when the provider guarantees idempotency. Non-repeatable uncertain effects
   require reconciliation; never recover by blindly issuing the effect again.

## Values and planning

The shared SDK validates DAGs, typed expressions and bounded structured input
mappings. It rejects executable expressions and undeclared fields. Primitive
constant result fields may be discovered; unsupported object/fractional constants
are not treated as scalars. Exact integer arithmetic and evidence freshness rules
are independent of model prose.

The browser preview and Worker coordinator share the pure graph planner. Preview
assumptions are synthetic and create no durable state. Runtime adds current actor,
source, provider, configuration, lifecycle, schema and authority checks. Never
accept a preview result as proof of a successful business operation.

## Declared form discovery

A signed `workflowServices.triggerDiscovery` declaration may name a static GET
operation with bounded `q` lookup, a referenced string selection field, and a
maximum observation age. The generic module form uses this metadata to retrieve
one selected trigger contract through the authenticated module gateway. It also
derives action-result fields from current approved, identity-pinned bindings.
Missing permissions, unavailable contracts and stale responses do not supply
fields or allow a synthetic preview. Publication and runtime remain authoritative.
Legacy declarations without trigger discovery remain valid.

Scalar discovery may explicitly omit bounded arrays and bounded dynamic maps;
their element/value schemas are still checked and their full schemas remain in
published contracts. Collection elements are not invented as scalar variables.
Unbounded collections, references and unsupported schemas remain rejected.
Business Automation 1.0.1 adopts this declaration and bounded-collection handling;
its already signed 1.0.0 predecessor remains unchanged.

## Parallel and lifecycle boundaries

Only distinct-provider, explicitly safe/idempotent ready actions can share a
bounded dispatch batch. Provider lifecycle exclusion and the durable coordinator
lock remain required. Each branch retains attempt/deadline state. The independent
successful-response journal preserves original observation timestamps and exact
input/source/provider/configuration fingerprints after coordinator rollback.

An upgraded/reinstalled/substituted provider is not automatically authorized to
finish work belonging to an older identity. Fail visibly and reconcile the original
obligation. Cancellation cannot reverse committed effects. New migrations append
to signed ancestry; never rewrite applied SQL to simplify recovery.

## Verification commands

Run from a committed source checkout with Node 24 and Docker available:

```powershell
npm run build
npm test
npm run test:workflow:browser
npm run test:workflow:governance:browser
```

The first two are the full source gates. Browser commands exercise component
fixtures; actual authenticated installed workflows, real container outages,
clean provisioning and data-preserving upgrades are additional release gates.
