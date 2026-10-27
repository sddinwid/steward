# Pricing Management

Independent module `steward.pricing.management` 1.0.0, minimum platform 0.15.0. The current operator upgrade is not yet accepted. Pricing uses its own database and requires neither Master nor AI for local SKU operations. Catalog is optional; a SKU string never establishes Catalog identity.

## Operating procedure

1. Configure an active price list with an explicit currency and an approval policy. Optionally configure one default list per currency; no list is guessed automatically.
2. Propose a fixed price or a single basis-point discount referencing a fixed base revision. Select a legacy SKU or an authorized cached Catalog subject. Terms become immutable on submission.
3. Have distinct authorized accounts review the exact terms as the policy requires. The proposer cannot impersonate another reviewer. Rejection blocks activation.
4. Explicitly activate the reviewed version. Future effective dates schedule its eligibility; they do not activate proposals automatically.
5. Use Resolution Preview for hypothetical comparisons. Request a quote for an actual bounded decision. Preview is always `previewOnly`, even when evaluating now, and cannot authorize a sale.
6. Inspect Quote Jobs for **current** authorization status. Resolution History retains original decisions as historical evidence; their presence does not establish current authorization. Quote status rechecks current approvals, source revisions and expiry.

The eight required screens and auxiliary policy/eligibility/source screens are signed generic SSDS contributions. Ordinary forms need no raw JSON, provider UUIDs or reviewer identity input. Permissions are distinct: `.read`, `.propose`, `.review`, `.activate`, `.configure` and `.catalog`, prefixed by the module ID. Configuration authority is consequential; grant it deliberately through existing Worker-local administration.

The host supplies fresh current reviewer membership. The module applies its own quorum/separation policy. Historical reviews never substitute for current membership, and cached header snapshots are not persisted as authority. A no-review policy still requires explicit activation.

## Exact resolution and evidence

See [ADR 0038](adr/0038-governed-pricing-decisions.md) for the complete selection specification. Explicit priority precedes variant/channel/customer/promotion specificity. Equally ranked outcomes conflict; IDs, insertion order and cheapest price do not break ties. A matching effective override that loses required authority cannot silently reveal a lower-ranked price.

Money is bounded exact integer cents, scale two, initially USD/EUR/GBP/CAD/AUD/CHF. No implicit conversion or unsupported currency exponent is claimed. Discounts floor integer discount cents before subtracting; quantity totals are bounded. Free zero prices are valid. Taxes, supplier costs and contribution are separate authorities, not implied by a resolved customer price.

Intervals are UTC and half open. Customer category eligibility comes from effective server-owned records. Promotion eligibility cannot bypass pricing approval. Catalog promotion eligibility is retrieved through Catalog 1.1's separately versioned `catalog.pricing-subjects.read` capability; the original Catalog lookup ABI is unchanged.

Explicit Catalog discovery/refresh jobs use approved SSMA bindings/workflows. Exact lookup receipts retain original entity, Worker, module installation, package, offering and variant revisions. A database generation orders observations independently of wall-clock changes. Different provider/source revisions require explicit new terms; they never silently retarget old rules. Catalog failures issue no invented price, while independent SKU pricing remains available.

Durable `pricing.request` and `pricing.status` bind consumer module, request identity/digest and job. Exact retries reuse receipts; conflicting requests or another consumer's status access fail. Decisions retain amounts, method, rule/list/policy/review/eligibility references, freshness and expiry boundaries. Full conflict evidence remains internal while bounded responses explain truncation. Hypothetical future previews disclose the assumption that current Catalog definitions and authority remain unchanged; they confer no future transaction authority.

Rule terms, reviews, completed decisions and history have database immutability guards. Metadata/state changes are revision checked. Restarts retain identity and evidence. New-work rules with changed policy/list/provider bases fail closed rather than rewriting historical decisions. Existing Sales acceptance integration is checkpoint 15D work; no customer charges or external price publication are implemented here.

## Commands

From repository root:

```powershell
npm ci --prefix modules/pricing
npm run build
npm run test:catalog:contracts
npm run test:pricing:module
npm run test:pricing:browser
```

From clean committed source, `npm run verify:pricing:package` builds/signs and exercises the real independent image in a disposable loopback fixture. It uses synthetic private reviewer/gateway contexts, not production accounts. Evidence is retained under `artifacts/phase15c-pricing-package`; secrets and containers are cleaned in `finally`. For a harness-only retry, `node scripts/verify-pricing-package.mjs --reuse-package <prior-public-evidence-directory>` requires unchanged original image build inputs. `STEWARD_PRICING_ACCEPTANCE_SUBNET` selects an explicit collision-checked private fixture subnet.

After the compatible platform upgrade is accepted, publish with the existing tool and install through that Worker's Module Manager:

```powershell
node scripts/publish-module.mjs modules/pricing <compatible-deployment-directory>
```

Initial configuration:

```json
{"integrationsEnabled":false,"catalogMaxAgeSeconds":300}
```

Catalog freshness is configurable from 10 to 3600 seconds. Enable interoperability only with the intended explicit binding/workflow. Cached definitions and hypothetical previews are not proof of future operational availability. No live provider catalogs, fulfillment, payments or financial commitments are modified by this module.
