// Capture before mutations; verification must never invent its baseline afterward.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {directory,manifest,sql,compose} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
const deployment=await manifest(),baseline={installations:{},inventory:{},enrollment:{}};
for(const i of deployment.instances){baseline.installations[i.key]=JSON.parse(await readFile(path.join(directory,i.key,'installation.json'),'utf8'));if(i.role==='worker'&&sql(i.key,"SELECT count(*) FROM module_installations WHERE module_id='cee.inventory'")==='1')baseline.inventory[i.key]=JSON.parse(compose('exec','-T',i.key+'-db','psql','-U','postgres','-d','m_'+digest('cee.inventory').slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c',"SELECT coalesce(json_agg(r),'[]') FROM (SELECT item_id,sku,name,quantity,revision,created_at,updated_at FROM inventory_items ORDER BY item_id)r"));}
baseline.enrollment['worker-1']=digest(sql('worker-1','SELECT certificate FROM local_enrollment WHERE singleton'));
const file=path.resolve(process.env.STEWARD_PHASE4_BASELINE_FILE??'artifacts/phase4-preserved-baseline.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(baseline,null,2)+'\n',{flag:'wx',mode:0o600});console.log('Captured original installation, enrolled certificate hash and existing Inventory rows before Phase 4 verification.');
