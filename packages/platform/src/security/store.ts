import type pg from 'pg';
import { fail } from './crypto.js';
export type Sql = Pick<pg.PoolClient, 'query'>;
export async function transaction<T>(pool: pg.Pool, work: (sql: pg.PoolClient) => Promise<T>): Promise<T> {
  const sql = await pool.connect();
  try { await sql.query('BEGIN'); const value = await work(sql); await sql.query('COMMIT'); return value; }
  catch (error) { await sql.query('ROLLBACK'); throw error; }
  finally { sql.release(); }
}
export async function audit(sql: Sql, actor: string | null, action: string, target: string | null, detail = {}) {
  await sql.query('INSERT INTO security_audit(actor_id,action,target_id,detail) VALUES($1,$2,$3,$4)', [actor, action, target, detail]);
}
export async function authorized(sql: Sql, accountId: string, entityId: string): Promise<void> {
  const entity = await sql.query('SELECT entity_id FROM legal_entities WHERE entity_id=$1', [entityId]);
  if (!entity.rowCount) fail(404, 'Unknown legal entity');
  const scope = await sql.query(`SELECT e.entity_id FROM legal_entities e
    JOIN entity_authorizations s ON s.entity_id=e.entity_id JOIN security_accounts a ON a.account_id=s.account_id
    WHERE a.account_id=$1 AND e.entity_id=$2 AND a.enabled AND e.enrollment_eligible
      AND a.role IN ('registry_admin','enrollment_admin') FOR SHARE OF e,s,a`, [accountId, entityId]);
  if (!scope.rowCount) fail(403, 'Enrollment is not authorized for this legal entity');
}
