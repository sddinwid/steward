import type pg from 'pg';
import type { InstallationConfig } from '@steward/contracts';
import type { SecureApp, Authentication } from './security/auth.js';
import { fail, validUuid } from './security/crypto.js';
import { audit, transaction } from './security/store.js';
export const workspaceMigration = `CREATE TABLE entity_preferences (
 entity_id uuid PRIMARY KEY, country text NOT NULL, base_currency text NOT NULL,
 locale text NOT NULL, timezone text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);`;
export function validatePreferences(b:any){
 if(!b||Object.keys(b).some(k=>!['country','baseCurrency','locale','timezone'].includes(k))||!['US','GB','DE','FR','NL','BE','IE','AT','ES','IT','CA','AU','CH','PL','CZ','HU','RO'].includes(b.country)||!['USD','EUR','GBP','CAD','AUD','CHF','PLN','CZK','HUF','RON'].includes(b.baseCurrency)||typeof b.locale!=='string'||typeof b.timezone!=='string'||b.locale.length>40||b.timezone.length>80)fail(400,'Choose a supported country, currency, locale and time zone');
 try{new Intl.NumberFormat(b.locale);new Intl.DateTimeFormat(b.locale,{timeZone:b.timezone});}catch{fail(400,'Locale or time zone is invalid');}
 return b as {country:string;baseCurrency:string;locale:string;timezone:string};
}
export function workspaceRoutes(app:SecureApp,pool:pg.Pool,auth:Authentication,installation:InstallationConfig){
 async function entityId(){if(installation.role==='worker'){const row=(await pool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];return row?.entity_id??installation.entity.entityId;}return installation.entity.entityId;}
 app.get('/api/v2/workspace/profile',async req=>{
  const actor=await auth.session(req);const id=await entityId();
  const enrollment=installation.role==='worker'?(await pool.query('SELECT entity_id,entity_name,state FROM local_enrollment WHERE singleton')).rows[0]:undefined;
  const preferences=(await pool.query('SELECT * FROM entity_preferences WHERE entity_id=$1',[id])).rows[0];
  return {entityId:id,name:enrollment?.state==='enrolled'?enrollment.entity_name:installation.entity.displayName,enrollmentState:enrollment?.state??null,preferences:preferences?{country:preferences.country,baseCurrency:preferences.base_currency,locale:preferences.locale,timezone:preferences.timezone}:null,administrator:actor.role===(installation.role==='worker'?'local_admin':'registry_admin')};
 });
 async function authorize(req:any,mutate:boolean){
  const actor=await auth.session(req,mutate);const id=req.params.id;if(!validUuid(id))fail(400,'Invalid entity');
  if(installation.role==='worker'){if(id!==await entityId()||actor.role!=='local_admin')fail(403,'Local company administrator required');}
  else {if(!['registry_admin','enrollment_admin'].includes(actor.role)||mutate&&actor.role!=='registry_admin')fail(403,'Company configuration requires a registry administrator');if(!(await pool.query('SELECT 1 FROM legal_entities WHERE entity_id=$1',[id])).rowCount)fail(404,'Company not found');if(actor.role!=='registry_admin'&&!(await pool.query('SELECT 1 FROM entity_authorizations WHERE entity_id=$1 AND account_id=$2',[id,actor.account_id])).rowCount)fail(403,'Entity scope denied');}
  return actor;
 }
 app.get<{Params:{id:string}}>('/api/v2/entities/:id/preferences',async req=>{await authorize(req,false);return {preferences:(await pool.query('SELECT * FROM entity_preferences WHERE entity_id=$1',[req.params.id])).rows[0]??null};});
 app.put<{Params:{id:string}}>('/api/v2/entities/:id/preferences',async req=>{const actor=await authorize(req,true);const b=validatePreferences(req.body);return transaction(pool,async sql=>{await sql.query(`INSERT INTO entity_preferences(entity_id,country,base_currency,locale,timezone) VALUES($1,$2,$3,$4,$5) ON CONFLICT(entity_id) DO UPDATE SET country=excluded.country,base_currency=excluded.base_currency,locale=excluded.locale,timezone=excluded.timezone,updated_at=now()`,[req.params.id,b.country,b.baseCurrency,b.locale,b.timezone]);await audit(sql,actor.account_id,'entity.preferences',req.params.id,{baseCurrency:b.baseCurrency});return {saved:true};});});
}
