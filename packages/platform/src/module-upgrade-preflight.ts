import type pg from 'pg';
import {moduleUpgradeBlockedMessage} from '@steward/module-sdk';
/** Only platform-owned governance tables; never module business schemas. */
export async function inspectUpgradeDependencies(db: Pick<pg.PoolClient,'query'>, moduleId: string) {
 const result=await db.query(`SELECT
 EXISTS(SELECT 1 FROM smart_bindings WHERE consumer_id=$1 OR provider_id=$1) AS bindings,
 EXISTS(SELECT 1 FROM smart_workflows w WHERE w.consumer_id=$1 OR EXISTS(SELECT 1 FROM smart_bindings b WHERE b.consumer_id=w.consumer_id AND b.provider_id=$1)) AS workflows,
 EXISTS(SELECT 1 FROM smart_obligations WHERE consumer_id=$1 OR provider_id=$1) AS obligations,
 EXISTS(SELECT 1 FROM smart_routes WHERE consumer_id=$1 OR provider_id=$1) AS deliveries`,[moduleId]);
 const row=result.rows[0];
 return {allowed:false,code:'MODULE_UPGRADE_CONTINUITY_REQUIRED',error:moduleUpgradeBlockedMessage,
 dependencies:{bindings:row.bindings?'present':'not-observed',workflows:row.workflows?'present':'not-observed',obligations:row.obligations?'present':'not-observed',deliveries:row.deliveries?'present':'not-observed',monitoring:'unknown-module-owned',reservations:'unknown-module-owned',uncertainExternalSubmissions:'unknown-module-owned',publicationApprovals:'unknown-module-owned'},
 recovery:'No changes applied. Keep the original installed package. Module-owned continuity attestation and reviewed execution are not implemented.'};
}
