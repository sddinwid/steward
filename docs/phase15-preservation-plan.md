# Phase 15 selected-deployment preservation

Read-only preflight was repeated during checkpoint 15H. The selected operator is
still the retained 0.14 installation; these checks are not an upgrade acceptance.

Observed state:

- 52 selected running containers: 16 core and 36 module runtimes.
- 40 databases: four core and 36 dedicated module databases.
- All seven original mounted volumes retained.
- All 36 installed module version/state/installation/package pins match baseline.
- All 141 baseline private-file hashes remain unchanged.

Worker 3 has an empty local Sales database and empty local Inventory, with no
pending connector jobs, issuance or outbox work. Shopify retains 17 product rows;
Printify retains five products, one shop and two connector records. One retained
connector is unavailable. Cached rows and historical statuses do not establish
fresh live connectivity or identify the current profile; preserve both profiles
and perform an authorized read-only poll before making freshness claims.

Worker 1 Inventory retains 200 reserved units in one item; Worker 2 retains six
across three items. Their paused simulations also retain pending financial
observation commands bound to original Sales providers. Historical Ledger rows
marked reserved have already been consumed, but this does not authorize moving
their obligations or replacing paused simulation bindings. Preserve these
providers and source pins. Worker 3's historical remote Inventory/Procurement
obligations must remain with their original peer providers; installing a fresh
local provider never transfers them.

Before deployment, add explicit 0.15 release/version/schema/routing support and
commit verified source. Use the existing upgrade mechanism to copy complete
private configuration and dump all four database servers before any image or
configuration change. Validate those backups. Upgrade the selected deployment in
place, retaining URLs, accounts, identity keys, trust, original module rows and
volumes. Do not start a second operator stack.

Use an explicit module upgrade allowlist with freshly checked pending work and
holds. Fresh Catalog/Pricing installations can use new dedicated databases.
Worker 3's empty local providers are candidates for narrowly scoped upgrades;
new Ledger/Procurement providers require explicit units and approved bindings.
Keep Workers 1/2's held or paused providers on their original images. Connector
upgrades must preserve live read-only configuration, private credentials, profiles
and native records. No live orders or outbound product/price publishing are part
of acceptance.

## Clean-checkout migration gate

All 84 working migration files match their frozen manifest hashes. A read-only
Git-blob/attribute audit nevertheless found 13 that a fresh checkout would
normalize incorrectly. This must be corrected before clean-source packaging,
without editing applied SQL, checksums, existing images or tags.

Eleven need explicit CRLF checkout policy: Catalog 001/002/004, Pricing 001/003,
Inventory 006, Stock Ledger 003, Shopify 005, Printify 005/006 and Sales 009.
Catalog 003 and Pricing 002 have mixed line endings; preserve their existing exact
bytes under `-text`, following the existing Participant migration precedent.
Converting those two to either all-LF or all-CRLF would change their checksums.

After the attribute/byte-preservation commit, use a real fresh detached checkout
with automatic line-ending conversion disabled. Verify every declared migration
against its committed manifest, including legacy and mixed-ending files, and
verify a clean working tree. `git archive` alone does not exercise checkout
filters. This is an open release gate until that actual check passes.
