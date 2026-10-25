import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const load=n=>import(pathToFileURL(path.resolve('scripts',n)).href);
const{directory,docker,compose}=await load('lib.mjs');process.env.STEWARD_SEED_CREDENTIALS_FILE=path.join(directory,'demo/presenter.json');
const{api,logins,waitFor}=await load('phase4-client.mjs');await logins();
const{digest}=await import(pathToFileURL(path.resolve('packages/module-sdk/dist/index.js')).href);
const report={startedAt:new Date().toISOString(),checks:[],liveMutations:false};
const modules=async()=>(await api('worker-3','/api/v3/modules')).value.installed;
const selected=rows=>rows.filter(m=>['cee.shopify','cee.printify'].includes(m.moduleId)).map(m=>({id:m.moduleId,version:m.version,image:m.imageId,operation:m.operationId,configuration:m.configuration}));
const before=selected(await modules()),privateDir=path.join(directory,'commerce/private/worker-3');
const hashes=async()=>Object.fromEntries(await Promise.all((await readdir(privateDir)).map(async n=>[n,createHash('sha256').update(await readFile(path.join(privateDir,n))).digest('hex')]))),privateBefore=await hashes();
const business=(id,url,method='GET',body)=>api('worker-3','/api/v3/modules/'+id+'/api'+url,method,body).then(r=>r.value);
const records=async(id,url)=>{const out=[];for(let offset=0;;offset+=20){const r=await business(id,url+'?limit=20&offset='+offset);out.push(...r.records);if(r.nextOffset==null)return out;}};
try{
 for(const m of before){assert.equal(m.configuration.mode,'live');assert.equal(m.configuration.integrationsEnabled,false);}
 const profiles=await records('cee.shopify','/live-connections');assert(profiles.length);report.shopify=[];
 for(const p of profiles){for(const operation of ['test','catalog']){const r=(await records('cee.shopify','/live-connections')).find(r=>r.id===p.id);await business('cee.shopify','/live-'+operation+'/'+r.id,'POST',{revision:r.revision,requestId:randomUUID()});const done=await waitFor(async()=>{const r=(await records('cee.shopify','/live-connections')).find(r=>r.id===p.id);if(r.status==='connection_unavailable')throw Error('Shopify read-only '+operation+' failed '+r.error);return !r.requestedOperation&&r.status===(operation==='test'?'verified':'synced')?r:false;},'real Shopify read-only '+operation,180000);report.shopify.push({operation,status:done.status,productCount:done.productCount??null,authentication:done.authentication,shopId:done.shopId});}}
 report.printify=await waitFor(async()=>{const r=await records('cee.printify','/connections');return r.some(r=>r.status==='available'&&!r.error)?r.map(r=>({status:r.status,error:r.error??null})):false;},'real Printify catalog availability',90000);
 report.catalogs={};for(const id of ['cee.shopify','cee.printify']){const items=await records(id,'/catalog');report.catalogs[id]={products:items.length,variants:items.reduce((n,p)=>n+(p.variants?.length??0),0)};assert(items.length>0);const count=compose('exec','-T','worker-3-db','psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-c',"SELECT count(*) FROM business_records WHERE data ? 'simulation'");assert.equal(count,'0');}
 assert.deepEqual(selected(await modules()),before);assert.deepEqual(await hashes(),privateBefore);
 report.checks.push('actual Shopify authentication, development-store identity and read-only catalog synchronization','Printify available live catalog connection and retained products','live connector versions, images, identities, configuration and private file hashes unchanged; zero synthetic records in either connector');
 report.isolation=[];
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));for(const key of ['worker-1','worker-2'])for(const id of ['steward.simulation.commerce','steward.simulation.fulfillment']){const install=manifest.instances.find(i=>i.key===key).installationId,container=docker(['ps','-q','--filter','label=steward.installation='+install,'--filter','label=steward.module='+id]);assert(container);const meta=JSON.parse(docker(['inspect',container]))[0];assert(!meta.Mounts.some(m=>/commerce[\\/]private|docker\.sock/.test(m.Source)));const networks=Object.keys(meta.NetworkSettings.Networks);for(const n of networks){const network=JSON.parse(docker(['network','inspect',n]))[0];assert.equal(network.Internal,true);}report.isolation.push({worker:key,module:id,networks,internalOnly:true,noConnectorSecretsOrDockerSocket:true});}
 report.status='passed';console.log('PASS protected live read-only catalog checks and isolated synthetic module containers.');
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.log(e.message);}finally{report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase11-live-isolation.json',JSON.stringify(report,null,2)+'\n');}
