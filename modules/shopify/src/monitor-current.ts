import {ensure,records,type Context,type RecordValue} from '@steward/business-kit';
import {canonical} from '@steward/module-sdk';
export async function currentAssociations(c:Context){return new Set((await records(c,'monitor-policy')).filter(p=>p.data.enabled===true&&canonical(p.data.owner)===canonical(c.providerIdentity)).map(p=>p.data.associationId));}
export async function requireCurrentMatch(c:Context,r:RecordValue){ensure((await currentAssociations(c)).has(r.data.associationId),'Historical comparison is read-only; use current monitoring',409);}
