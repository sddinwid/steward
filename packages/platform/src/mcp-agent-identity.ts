import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { hash, fail } from './security/crypto.js';
// Per-process attribution key. It never leaves the API process, and restarting
// invalidates every outstanding proof. It grants no authority over the user.
const key=randomBytes(32),seen=new Map<string,number>();
export function agentProof(cookie:string){
  const payload=Buffer.from(JSON.stringify({purpose:'steward-analyst-mcp-v1',session:hash(cookie),expiresAt:Date.now()+10000,nonce:randomUUID()})).toString('base64url');
  return payload+'.'+createHmac('sha256',key).update(payload).digest('base64url');
}
export function verifyAgentProof(proof:unknown,cookie:string){
  if(typeof proof!=='string'||proof.length>1000)fail(403,'Analyst process proof required');
  const [payload,signature]=proof.split('.');if(!payload||!signature)fail(403,'Invalid Analyst proof');
  const expected=createHmac('sha256',key).update(payload).digest(),actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))fail(403,'Invalid Analyst proof');
  let p:any;try{p=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{fail(403,'Invalid Analyst proof');}
  if(p.purpose!=='steward-analyst-mcp-v1'||p.session!==hash(cookie)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<Date.now()||p.expiresAt>Date.now()+10000||typeof p.nonce!=='string')fail(403,'Invalid Analyst proof');
  for(const [nonce,expiresAt]of seen)if(expiresAt<Date.now())seen.delete(nonce);
  if(seen.has(p.nonce))fail(403,'Replayed Analyst proof');if(seen.size>=1024)fail(429,'Analyst attribution budget exceeded');
  seen.set(p.nonce,p.expiresAt);
}
