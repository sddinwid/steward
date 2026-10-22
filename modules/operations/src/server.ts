import Fastify from 'fastify';
import type pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
const manifest=JSON.parse(readFileSync('./manifest.json','utf8'));
export function createOperationsServer(pool:pg.Pool,token:string,migrate:()=>Promise<number>,ready:()=>Promise<void>,currency:string){
  const app=Fastify({logger:false,bodyLimit:16384});
  app.addHook('onRequest',async(req,reply)=>{if(req.url==='/health')return;const value=Buffer.from(req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'');const expected=Buffer.from(token);if(value.length!==expected.length||!timingSafeEqual(value,expected))return reply.code(401).send({error:'Module gateway authentication required'});});
  app.get('/health',async()=>({status:'ok'}));app.get('/ready',async(_req,reply)=>{try{await ready();return{status:'ready'};}catch{return reply.code(503).send({error:'Schema unavailable'});}});
  app.post('/internal/migrate',async(_req,reply)=>{try{return{schemaVersion:await migrate()};}catch{return reply.code(503).send({error:'Module migration failed; prior data retained'});}});
  for(const screen of manifest.ui){
    const api=manifest.api.find((a:any)=>a.operationId===screen.listOperation);const table=({capacities:'capacities',storage:'storage_requirements',assets:'warehouse_assets'} as Record<string,string>)[screen.screenId]!;
    const names:string[]=screen.fields.filter((f:any)=>!f.readOnly).map((f:any)=>f.name);const numeric:string[]=screen.fields.filter((f:any)=>f.type==='number').map((f:any)=>f.name);
    const properties=Object.fromEntries(screen.fields.filter((f:any)=>!f.readOnly).map((f:any)=>[f.name,f.type==='number'?{type:'number',minimum:0,maximum:999999999999.999}:{type:'string',minLength:1,maxLength:f.maxLength,pattern:f.name==='currency'?'^[A-Z]{3}$':'\\S'}]));
    const select='id,revision,'+screen.fields.map((f:any)=>numeric.includes(f.name)?`${f.name}::float8 AS ${f.name}`:f.name).join(',');
    const valid=(b:any)=>!names.some(n=>typeof b[n]==='number'&&!Number.isFinite(b[n]))&&(b.capacity_m3===undefined||b.utilized_m3<=b.capacity_m3);
    app.get(api.path,async()=>({records:(await pool.query(`SELECT ${select} FROM ${table} ORDER BY name,id`)).rows,summary:`Module currency default: ${currency}. Quantities use cubic metres; costs are monthly.`}));
    app.post<{Body:Record<string,any>}>(api.path,{schema:{body:{type:'object',additionalProperties:false,required:names,properties}}},async(req,reply)=>{
      if(!valid(req.body))return reply.code(400).send({error:'Utilization cannot exceed available total capacity'});
      const record=(await pool.query(`INSERT INTO ${table}(id,${names.join(',')}) VALUES($1,${names.map((_,i)=>'$'+(i+2)).join(',')}) RETURNING ${select}`,[randomUUID(),...names.map(n=>req.body[n])])).rows[0];return reply.code(201).send({record});
    });
    app.put<{Params:{id:string};Body:Record<string,any>}>(api.path+'/:id',{schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}},body:{type:'object',additionalProperties:false,required:[...names,'revision'],properties:{...properties,revision:{type:'integer',minimum:1}}}}},async(req,reply)=>{
      if(!valid(req.body))return reply.code(400).send({error:'Utilization cannot exceed total capacity'});
      const record=(await pool.query(`UPDATE ${table} SET ${names.map((n,i)=>n+'=$'+(i+1)).join(',')},revision=revision+1,updated_at=now() WHERE id=$${names.length+1} AND revision=$${names.length+2} RETURNING ${select}`,[...names.map(n=>req.body[n]),req.params.id,req.body.revision])).rows[0];if(!record)return reply.code(409).send({error:'Record changed; refresh'});return{record};
    });
  }
  app.setErrorHandler((e,_req,reply)=>reply.code((e as any).statusCode??500).send({error:'Operational request failed'}));return app;
}
