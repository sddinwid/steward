// An isolated PostgreSQL fixture: never connects to operator databases.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {businessSql,createBusinessServer} from '../packages/business-kit/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';

const directory='.steward/phase15-preview-tests',container='steward-preview-'+randomUUID();
const file=directory+'/'+randomUUID()+'.env',password=randomBytes(32).toString('hex');
await mkdir(directory,{recursive:true});privateDirectory(directory);
await writeFile(file,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let pool,app;
try{
 docker(['run','--rm','-d','--name',container,'--env-file',file,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
 pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',password,connectionTimeoutMillis:1000});
 for(let n=0;;n++){try{await pool.query('SELECT 1');break;}catch(e){if(n===30)throw e;await delay(300);}}
 await pool.query(businessSql);await pool.query('CREATE TABLE preview_probe(value integer NOT NULL)');
 const moduleId='test.preview',actor=randomUUID();
 const manifest={moduleId,api:[{operationId:'preview',method:'POST',path:'/preview',permission:moduleId+'.read'}],ui:[]};
 const schema={type:'object',additionalProperties:false,properties:{write:{type:'boolean'}},required:['write']};
 const audits=[];
 app=createBusinessServer(pool,'test-gateway',{installationId:randomUUID(),configuration:{}},{manifest,resources:[],actions:[],auditAccess:async event=>audits.push(event),queries:[{method:'POST',path:'/preview',schema,run:async(ctx,_q,body)=>{
  const readonly=(await ctx.db.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
  if(body.write)await ctx.db.query('INSERT INTO preview_probe VALUES(1)');
  return{readonly,records:[]};
 }}]},async()=>1,async()=>{});
 const headers={authorization:'Bearer test-gateway','x-steward-actor':actor,'x-steward-permissions':JSON.stringify([moduleId+'.read'])};
 const request=(payload,override={})=>app.inject({method:'POST',url:'/preview',headers:{...headers,...override},payload});
 await test('PostgreSQL enforces read-only preview transactions and rejects attempted writes',async()=>{
  const read=await request({write:false});assert.equal(read.statusCode,200,read.body);assert.equal(read.json().readonly,'on');
  const write=await request({write:true});assert.equal(write.statusCode,500,write.body);
  assert.equal((await pool.query('SELECT count(*)::int n FROM preview_probe')).rows[0].n,0);
  assert.equal((await request({write:false})).statusCode,200);
 });
 await test('preview authorization and closed input validation precede execution and remain audited',async()=>{
  assert.equal((await request({write:false},{'x-steward-permissions':'[]'})).statusCode,403);
  assert.equal((await request({write:false,approved:true})).statusCode,400);
  assert.equal((await request({write:false},{authorization:'Bearer wrong'})).statusCode,401);
  assert(audits.some(e=>e.statusCode===200&&e.allowed));assert(audits.some(e=>e.statusCode===403&&!e.allowed));
 });
}finally{
 await app?.close();await pool?.end();
 try{docker(['rm','-f',container]);}catch{}
 await rm(file,{force:true});
}
