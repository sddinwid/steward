import {ensure,find,save,type Context,type Definition} from '@steward/business-kit';
import {canonical,validateCapabilityValue,type IntegrationCommand} from '@steward/module-sdk';
const capabilityId='workflow.notifications';
const labels:Record<string,string>={approval:'Human workflow approval required',exception:'Operational exception requires review',failure:'Workflow failure requires review',completed:'Workflow action completed',deadline:'Time-sensitive workflow condition requires review'};
function reviewers(c:Context){const p=c.approvalPrincipals;ensure(c.entityId&&p&&p.reviewerPermission===c.moduleId+'.approve'&&p.issuedAt<=Date.now()&&p.issuedAt>=Date.now()-5000,'NOTIFICATION_RECIPIENT_AUTHORITY_UNAVAILABLE',403);return p.actors;}
function local(c:Context,command:IntegrationCommand){const p=c.providerIdentity,s=c.incomingProviderIdentity;ensure(c.config.notificationsEnabled===true&&!c.peerScope&&p&&s&&p.entityId===c.entityId&&p.workerInstallationId===c.installationId&&s.entityId===c.entityId&&s.workerInstallationId===c.installationId&&s.moduleId===command.sourceModuleId&&command.capability?.capabilityId===capabilityId,'NOTIFICATION_SOURCE_AUTHORITY_REQUIRED',403);return s;}
async function current(c:Context,r:any){const now=new Date((await c.db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();return r.data.status==='acknowledged'?'acknowledged':Date.parse(r.data.expiresAt)<=now?'expired':'available';}
/** Internal recipient inbox only. No email/SMS, business payloads or participant
 * fields. Opaque references still require authorization in their source module. */
export function withWorkflowNotifications(definition:Definition):Definition{
 const authorize=definition.authorize,receive=definition.receive;
 definition.authorize=async(c,a)=>{
  if(['integration-status','integration-ack'].includes(a.operation)){ensure(c.actor==='module-runtime'&&c.providerIdentity?.entityId===c.entityId&&c.providerIdentity?.workerInstallationId===c.installationId,'NOTIFICATION_RUNTIME_AUTHORITY_REQUIRED',403);return;}
  if(a.operation==='integration-receive'&&a.command?.command.startsWith('workflow.notification.')){
   const source=local(c,a.command),op=definition.manifest.smart?.provides.find(p=>p.capabilityId===capabilityId)?.operations.find(o=>o.command===a.command!.command);ensure(op,'NOTIFICATION_OPERATION_UNSUPPORTED',403);validateCapabilityValue(a.command.payload,op!.input);
   const b=a.command.payload as any,old=await find(c,'workflow-notification',b.notificationId.toLowerCase());
   if(old)ensure(canonical(old.data.source)===canonical(source)&&old.data.ownerEntityId===c.entityId,'NOTIFICATION_ORIGINAL_SOURCE_REQUIRED',403);
   const recipient=b.recipientId??old?.data.recipientId;ensure(reviewers(c).includes(recipient),'NOTIFICATION_RECIPIENT_NOT_AUTHORIZED',403);return;
  }
  await authorize?.(c,a);
  if(a.kind==='workflow-notification'){ensure(a.record?.data.recipientId===c.actor&&reviewers(c).includes(c.actor),'NOTIFICATION_RECIPIENT_REQUIRED',403);}
 };
 definition.receive=async(command,c)=>{
  if(!command.command.startsWith('workflow.notification.')){ensure(receive,'Notification operation unsupported',403);return receive!(command,c);}
  const b=command.payload as any,key=b.notificationId.toLowerCase();await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1617))',[key]);let row=await find(c,'workflow-notification',key);
  if(row)ensure(row.data.ownerEntityId===c.entityId&&canonical(row.data.source)===canonical(local(c,command)),'NOTIFICATION_ORIGINAL_SOURCE_REQUIRED',403);
  if(command.command==='workflow.notification.send'){
   const fingerprint=canonical(b);if(row)ensure(row.data.fingerprint===fingerprint,'NOTIFICATION_INTENT_CONFLICT',409);
   else{const now=new Date((await c.db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();ensure(Number.isFinite(Date.parse(b.expiresAt))&&Date.parse(b.expiresAt)>now&&Date.parse(b.expiresAt)<=now+2678400000,'NOTIFICATION_EXPIRY_INVALID',422);
    row=await save(c,'workflow-notification',key,{ownerEntityId:c.entityId,source:local(c,command),fingerprint,notificationId:key,recipientId:b.recipientId,kind:b.kind,title:labels[b.kind],referenceId:b.referenceId,expiresAt:b.expiresAt,status:'available',deliveredAt:new Date(now).toISOString(),acknowledgedAt:null});
    await c.db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)',[c.actor,'notification.internal.delivered',row.id]);}
  }
  ensure(row,'NOTIFICATION_NOT_FOUND',404);return{notificationId:key,status:await current(c,row),channel:'internal',recipientId:row!.data.recipientId};
 };
 definition.queries??=[];
 definition.queries.push({path:'/notification-recipients',run:async c=>({records:reviewers(c).map(id=>({id,name:'Authorized workflow reviewer '+id})),summary:'Enabled local administrators and workflow reviewers only; these are internal inbox recipients.'})},{path:'/notifications',run:async(c,q)=>{ensure(reviewers(c).includes(c.actor),'NOTIFICATION_RECIPIENT_REQUIRED',403);const limit=Number(q?.limit??20),offset=Number(q?.offset??0);ensure(Number.isInteger(limit)&&limit>=1&&limit<=20&&Number.isInteger(offset)&&offset>=0&&offset<=10000,'Invalid notification page',400);const rows=(await c.db.query("SELECT * FROM business_records WHERE kind='workflow-notification' AND data->>'ownerEntityId'=$1 AND data->>'recipientId'=$2 ORDER BY updated_at DESC,id LIMIT $3 OFFSET $4",[c.entityId,c.actor,limit+1,offset])).rows;return{records:await Promise.all(rows.slice(0,limit).map(async r=>({id:r.id,revision:r.revision,title:r.data.title,referenceId:r.data.referenceId,status:await current(c,r),expiresAt:r.data.expiresAt,deliveredAt:r.data.deliveredAt,acknowledgedAt:r.data.acknowledgedAt}))),nextOffset:rows.length>limit?offset+limit:null,summary:'Your internal workflow inbox. Delivery is not acknowledgment or business authorization.'};}});
 definition.actions.push({kind:'workflow-notification',path:'/acknowledge-notification/:id',permission:definition.manifest.moduleId+'.approve',run:async(r,c)=>{ensure(await current(c,r)!=='expired','NOTIFICATION_EXPIRED',409);const now=(await c.db.query('SELECT clock_timestamp() AS now')).rows[0].now;const changed=r.data.status==='acknowledged'?r:await save(c,r.kind,r.key,{...r.data,status:'acknowledged',acknowledgedAt:now.toISOString()},r);return{record:{id:changed.id,revision:changed.revision,title:changed.data.title,referenceId:changed.data.referenceId,status:changed.data.status,expiresAt:changed.data.expiresAt,deliveredAt:changed.data.deliveredAt,acknowledgedAt:changed.data.acknowledgedAt}};}});
 return definition;
}
