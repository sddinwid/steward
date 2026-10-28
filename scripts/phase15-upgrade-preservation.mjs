import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

// Only successful connector-read receipts may renew their observation lease.
// Every other column, row and table remains subject to exact preservation.
export function isRenewableConnectorTable(moduleId,table){
 return table==='external_catalog_sync'&&['cee.shopify','cee.printify'].includes(moduleId)||table==='printify_cost_sync'&&moduleId==='cee.printify';
}
function micros(value){
 assert.equal(typeof value,'string','Recorded timestamp required');
 const m=/^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
 assert(m,'Canonical UTC database timestamp required');
 const base=m[1]+'T'+m[2]+'.000Z',n=Date.parse(base);
 assert(Number.isFinite(n)&&new Date(n).toISOString()===base,'Invalid calendar timestamp');
 return BigInt(n)*1000n+BigInt((m[3]??'').padEnd(6,'0'));
}
function rowFacts(row){const {observed_at,expires_at,...facts}=row;return facts;}
export function validateConnectorRenewal(moduleId,table,before,after){
 assert(isRenewableConnectorTable(moduleId,table),'Table is not a renewable connector receipt');
 assert(Array.isArray(before.rows)&&Array.isArray(after.rows),'Private raw receipt snapshots required');
 const capturedBefore=micros(before.capturedAt),capturedAfter=micros(after.capturedAt);
 assert(capturedAfter>=capturedBefore,'Snapshot clock moved backwards');
 const index=rows=>{const map=new Map();for(const row of rows){assert.equal(typeof row.connection_id,'string');assert(!map.has(row.connection_id),'Duplicate receipt identity');map.set(row.connection_id,row);}return map;};
 const old=index(before.rows),next=index(after.rows);assert(isDeepStrictEqual([...next.keys()].sort(),[...old.keys()].sort()),'Connector receipt identities changed');
 let renewed=0;
 for(const[id,a]of old){const b=next.get(id);assert(isDeepStrictEqual(rowFacts(b),rowFacts(a)),'Connector receipt facts changed');
  const ao=micros(a.observed_at),ae=micros(a.expires_at),bo=micros(b.observed_at),be=micros(b.expires_at),lease=ae-ao;
  assert(lease>=10000000n&&lease<=86400000000n,'Receipt lease outside supported bounds');
  assert.equal(be-bo,lease,'Receipt lease duration changed');
  if(table==='external_catalog_sync'){assert(Number.isInteger(a.lease_seconds)&&a.lease_seconds>=10&&a.lease_seconds<=86400,'Invalid recorded lease policy');assert.equal(lease,BigInt(a.lease_seconds)*1000000n,'Receipt differs from recorded lease policy');}
  assert(ao<=capturedBefore&&bo<=capturedAfter,'Observation is newer than database capture');
  assert(bo>=ao&&be>=ae,'Receipt timestamps moved backwards');
  if(bo!==ao){assert(bo>=capturedBefore,'Renewed receipt predates initial snapshot');assert(table!=='external_catalog_sync'||b.status==='available','Unavailable receipt cannot renew a successful read');renewed++;}
 }
 return {rows:old.size,renewed};
}
