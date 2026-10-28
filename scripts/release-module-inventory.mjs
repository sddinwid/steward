import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {validatePhase16Versions} from './release-contracts.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const escape=value=>String(value).replaceAll('|','\\|').replace(/[\r\n]+/g,' ').trim();
export function renderModuleInventory(versions,packages,snapshot,{candidate=false}={}){
 validatePhase16Versions(versions);assert(Array.isArray(packages)&&packages.length===Object.keys(versions.modules).length,'Every release module must have exactly one designated package');
 const selected=new Map();for(const p of packages){const m=p?.manifest;assert(m&&typeof m.name==='string'&&typeof m.description==='string','Real manifest metadata required');assert.equal(m.version,versions.modules[m.moduleId],'Package differs from designated release version');assert(!selected.has(m.moduleId),'Duplicate or ambiguous module package');selected.set(m.moduleId,m);}
 assert(snapshot?.formatVersion===1&&snapshot.status==='passed'&&snapshot.source==='selected-worker-databases'&&Number.isFinite(Date.parse(snapshot.capturedAt))&&Array.isArray(snapshot.workers)&&snapshot.workers.length,'Verified installed-state snapshot required');
 const workers=new Set();for(const worker of snapshot.workers){assert(/^worker-[1-9][0-9]*$/.test(worker.key)&&!workers.has(worker.key),'Worker identity is missing or duplicated');workers.add(worker.key);assert(Array.isArray(worker.modules));const ids=new Set();for(const module of worker.modules){assert(typeof module.moduleId==='string'&&!ids.has(module.moduleId),'Duplicate installed module');ids.add(module.moduleId);assert(/^\d+\.\d+\.\d+$/.test(module.version)&&typeof module.state==='string'&&/^[a-f0-9]{64}$/.test(module.packageDigest),'Verified module identity required');}}
 const lines=['## Module Inventory — v0.16.0'+(candidate?' (candidate)':''),'','| Module | Version at v0.16.0 release | Purpose | Installation |','| --- | --- | --- | --- |'];
 for(const [id,m]of [...selected].sort((a,b)=>a[1].name.localeCompare(b[1].name,'en'))){
  const installed=snapshot.workers.flatMap(w=>{const found=w.modules.find(p=>p.moduleId===id);return found?[w.key.replace('worker-','Worker ')+(found.version===m.version?'':' retains '+found.version)+(found.state==='active'?'':' ('+found.state+')')]:[];});
  lines.push('| '+[m.name+' (`'+id+'`)',m.version,m.description,installed.length?installed.join('; '):'Packaged; not installed'].map(escape).join(' | ')+' |');
 }
 return lines.join('\n')+'\n';
}
export async function inventoryFromBundle(bundle,snapshot,options={}){
 const root=path.resolve(bundle),release=JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));assert.equal(release.version,'0.16.0');assert.equal(release.acceptanceStatus,options.candidate?'candidate':'accepted','Do not present an unaccepted candidate as a release');
 async function member(name){const bytes=await readFile(path.join(root,name));assert.equal(hash(bytes),release.files[name],'Release inventory member checksum mismatch');return JSON.parse(bytes);}
 return renderModuleInventory(await member('toolkit/docs/phase16-module-versions.json'),await member('module-packages.json'),snapshot,options);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{bundle:{type:'string'},snapshot:{type:'string'},readme:{type:'string'},verify:{type:'boolean',default:false},candidate:{type:'boolean',default:false}}});
 assert(values.bundle&&values.snapshot,'Specify --bundle and --snapshot');const table=await inventoryFromBundle(values.bundle,JSON.parse(await readFile(values.snapshot,'utf8')),{candidate:values.candidate});
 if(values.readme){const original=await readFile(values.readme,'utf8'),start='<!-- steward-module-inventory:start -->',end='<!-- steward-module-inventory:end -->';assert(original.split(start).length===2&&original.split(end).length===2,'README must contain exactly one inventory marker pair');const a=original.indexOf(start)+start.length,b=original.indexOf(end);assert(a<b);const next=original.slice(0,a)+'\n'+table+'\n'+original.slice(b);if(values.verify)assert.equal(original,next,'README inventory differs from accepted package or actual installation records');else await writeFile(values.readme,next);}
 else process.stdout.write(table);
}
