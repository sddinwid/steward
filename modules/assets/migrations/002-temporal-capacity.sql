-- Scheduled transitions invalidate snapshots until the module refreshes them.
ALTER TABLE capacities ADD COLUMN valid_until timestamptz;
