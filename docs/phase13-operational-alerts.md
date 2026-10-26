# Governed operational observations

The Mission workspace evaluates fixed predicates over already authorized,
human-reviewed sealed programme releases. It never reads participant cases,
reconstructs a suppressed complement, narrows a cohort, or automatically creates
a finding. Named-account calculate permission is required for every evaluated
source. Publication requires current publish permission and explicit review of
every actual positive alert.

The predicates are:

| Observation | Explicit source field | Threshold |
| --- | --- | --- |
| No available housing capacity | `availableHousingUnits` | zero |
| Allocated training capacity exhausted | `availableTrainingSeats` | zero |
| Known local stock shortages | `localSupplyShortages` | greater than zero |
| Unresolved authorized referral follow-up | `unresolvedAuthorizedReferralParticipants` | greater than zero |
| Employment opportunities for human exploration | `employmentOpportunities` | greater than zero |
| Potential capacity sharing | Explicit unresolved referral participants and available housing units, from matching closed periods | both greater than zero |

Missing, stale, suppressed or unsupported observations remain unknown. These
predicates do not establish suitability, overdue services, candidate matches,
eligibility or an entitlement to shared resources. Funding-gap findings continue
to use the separate exact-cent, scientifically reconciled sustainability path.

The Participant source counts each scoped participant once if an explicitly
reviewed referral remains unresolved. Newer receipts and missing disposition
chronology cannot establish historical settlement; the whole metric becomes
unknown. The ordinary whole-vector small-group/complementary suppression rules
apply to this participant metric. Source references contain no case identifiers.

Food's new metric counts **local stock resources** below their configured
threshold, not recipients, consumption per person, or all external supplies.
External Inventory stock is outside this expressly local metric. A zero local
count never establishes external availability. A local quantity observation
newer than the cutoff remains unknown. Publications contain no stock identifiers,
sites or per-stock dimensions. Existing fixed-cohort suppression still applies.

Employment opportunities and the new source metrics are optional additions to
the closed v1 projection schema. A retained older sealed release can omit them;
omission means unknown and its bytes are never rewritten. Participant 1.0.3 and
Food 1.0.1 preserve all historical migrations and retain their existing dedicated
databases. New source releases use the new fields only on an ordinary first seal;
an old cohort cannot be resealed to insert a desired result.

Operational reviews retain exact full source references and source-paired
evidence in the existing mission calculation store under a distinct capability.
A reviewed publication snapshot retains only sources of actual positive alerts.
Clear or unknown programmes are not made affected recipients. Existing signed
finding synchronization and current Worker-local programme authorization apply;
operational findings require programme authority without adding unrelated
financial authority. Retained reviews, publications and findings continue to
recheck current disclosure permissions after revocation.

After actual G/H source acceptance:

```powershell
node scripts/verify-phase13-operational-alerts.mjs <deployment-directory>
```

Clean acceptance additionally passes `--require-positive`, using an explicitly
created known local stock shortage before the first canonical seal. It exercises
normal browser evaluation/review/publication and affected-only Worker
acknowledgments. On retained old releases, a no-positive result is reported
honestly and does not establish the positive publication gate. Evidence is in
`artifacts/phase13-operational-alerts.json` and the associated browser captures.
