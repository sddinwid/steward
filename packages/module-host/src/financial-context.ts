import type pg from 'pg';
/** Read only this Worker's authentication store; financial roles remain module-owned. */
export async function financialAuthorityHeaders(db:Pick<pg.Pool,'query'>,moduleId:string):Promise<Record<string,string>>{
 const row=(await db.query('SELECT descriptor FROM module_installations WHERE module_id=$1',[moduleId])).rows[0];
 if(!row?.descriptor?.payload?.manifest?.economicServices)return{};
 const actors=(await db.query("SELECT a.account_id FROM security_accounts a WHERE a.enabled AND (a.role='local_admin' OR a.role='module_user' AND EXISTS(SELECT 1 FROM module_permissions p WHERE p.account_id=a.account_id AND p.module_id=$1 AND p.permission=$2)) ORDER BY a.account_id LIMIT 257",[moduleId,moduleId+'.admin'])).rows;
 if(actors.length>256)throw Error('FINANCIAL_PRINCIPAL_LIMIT_REACHED');
 return{'x-steward-financial-principals':JSON.stringify({issuedAt:Date.now(),actors:actors.map(r=>r.account_id)})};
}
