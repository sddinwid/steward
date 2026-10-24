# UI/UX capability inventory and acceptance tracking

Baseline: branch phase8/smart-modules-commerce, commit 7d3a70d, tag v0.8.0. Working tree was clean. Work continues on ux/business-workspaces.

Signed package declarations are authoritative for module operations. Discovery filters active packages and per-operation permissions. Existing packages are kept byte-for-byte; presentation improvements do not require republishing packages.

| Module | Version | Declared screens | Backend operations |
|---|---|---|---|
| Assets | 1.0.3 | assets facility, assets asset, assets maintenance, assets booking, assets reports, assets delivery | listFacility, createFacility, updateFacility, listAsset, createAsset, updateAsset, publish, listMaintenance, createMaintenance, updateMaintenance, complete, listBooking, createBooking, updateBooking, cancelBooking, reports, integrationStatus, withdraw |
| Inventory | 1.4.0 | Inventory | listItems, createItem, updateItem, integrationStatus |
| Business operations | 1.0.0 | Capacity, Storage requirements, Warehouse assets | listcapacities, createcapacities, updatecapacities, liststorage, createstorage, updatestorage, listassets, createassets, updateassets |
| Printify | 1.0.3 | printify mapping, printify connection, printify product, printify job, printify shop | listmapping, createmapping, updatemapping, listconnection, synchronize, listproduct, listjob, authorize, reconcile, listshop |
| Procurement | 1.0.2 | procurement supplier, procurement requisition, procurement order, procurement receipt, procurement quote, procurement reports, procurement delivery | listSupplier, createSupplier, updateSupplier, listRequisition, createRequisition, updateRequisition, publishDemand, listOrder, createOrder, updateOrder, submit, approve, place, cancel, listReceipt, createReceipt, updateReceipt, retryStock, listQuote, createQuote, updateQuote, publishQuote, reports, integrationStatus, withdrawDemand, withdrawQuote |
| Sales | 1.1.1 | sales customer, sales order, sales fulfillment, sales reports, sales delivery | listCustomer, createCustomer, updateCustomer, listOrder, createOrder, updateOrder, confirm, cancel, listFulfillment, createFulfillment, updateFulfillment, reports, integrationStatus, salesByPeriod, production, publishCommerce, withdrawCommerce |
| Shopify | 1.0.1 | shopify mapping, shopify connection, shopify product, shopify order | listmapping, createmapping, updatemapping, listconnection, synchronize, listproduct, listorder, dispatch |
| Stock-ledger | 1.0.0 | stock-ledger item, stock-ledger reservation | listitem, createitem, updateitem, listreservation |
| Workforce | 1.0.2 | workforce skill, workforce person, workforce program, workforce enrollment, workforce achievement, workforce position, workforce reports, Private candidate matches, workforce delivery | listSkill, createSkill, updateSkill, publishSkills, listPerson, createPerson, updatePerson, listProgram, createProgram, updateProgram, publishProgram, listEnrollment, createEnrollment, updateEnrollment, complete, listAchievement, listPosition, createPosition, updatePosition, publishPosition, reports, integrationStatus, candidateMatches, withdrawSkills, withdrawProgram, withdrawPosition |

## Platform capabilities

- Authentication, registry, entity authorization, device authorization, enrollment decision, trust and audit: existing HTTPS routes and account roles remain authoritative.
- Module Manager: trusted catalog, compatibility, migrations, install/recovery, activation/deactivation, configuration, accounts and module permissions.
- SSMA: signed capabilities, resolver, governed bindings, workflow definitions, executions, original-provider recovery and delivery diagnostics.
- Synchronization: module-owned outboxes, authenticated exchanges, analytical projections, relationships, findings, affected-only delivery, acknowledgment/resolution.
- MCP and Analyst: provider status, authorized tool discovery/invocation, four investigation capabilities (resource sharing, procurement, workforce and commerce), persisted activity/evidence, deterministic analyses and human-reviewed finding publication.

## Baseline usability gaps

The baseline foundation landing page mixed all roles and technical material in one long page. Module screens required selecting raw package labels. Configuration, order lines, calculation results and finding references required JSON knowledge. Investigation history was a dropdown buried below the launch form. The configured bootstrap entity heading could differ from the enrolled legal entity. Worker findings were inaccessible to normal module users.

## Current implementation stages

1. Shared shell, responsive navigation, signed-discovery screen grouping and role gates: implemented; browser acceptance pending.
2. Generic business forms, structured line editor, record search, original-currency formatting: implemented; browser acceptance pending.
3. Worker administration and developer destinations: separated using existing authoritative local_admin role; no new implied technical privileges.
4. Master dashboard, persisted history, readable calculations and consolidated findings: implemented; browser acceptance pending.
5. Entity localization: append-only migration 10 and scoped audited HTTPS preferences. Saving a preference never converts or changes module records. No automatic reconfiguration of previously installed modules.
6. USD demonstration, full browser/regression and retained deployment preservation: pending. This checkpoint is not final acceptance.

## Identity and currency rules

Business headers use the authenticated workspace profile, which resolves the enrolled legal entity. Developer diagnostics explicitly label installation and configured bootstrap identity. No data reassociation occurs.

Company preferences are local to each installation; enrollment does not imply configuration synchronization. Existing entities with no preferences remain unspecified and new record forms retain the legacy EUR fallback. A new US company form proposes USD and en-US, requiring explicit save. Existing EUR demo fixtures are retained. Cross-currency analytical rejections remain authoritative. Module currency configuration is a separate explicit administrator action.

UI finalization adds Printify Native Fulfillment (read-only external-order status/tracking), Shopify fulfillment ownership/status and native-ownership dispatch rejection. These are separately versioned signed module contributions, discovered without Worker core changes.
