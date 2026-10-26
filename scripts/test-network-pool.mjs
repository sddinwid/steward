// Real entrypoint regression. Docker inventory is read only; no network or
// container is created, stopped, removed or changed by this fixture.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
test('optional scientific subnet appends to explicit allocations without shifting existing deployment networks',async()=>{
 const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),ids=docker(['network','ls','-q']).split(/\s+/).filter(Boolean),networks=ids.length?JSON.parse(docker(['network','inspect',...ids])):[];
 const range=cidr=>{const[ip,bits]=cidr.split('/'),size=2**(32-Number(bits)),number=ip.split('.').reduce((n,v)=>n*256+Number(v),0),start=Math.floor(number/size)*size;return[start,start+size-1];};
 const occupied=networks.flatMap(n=>(n.IPAM?.Config??[]).filter(c=>c.Subnet&&!c.Subnet.includes(':')).map(c=>range(c.Subnet)));
 const octet=Array.from({length:255},(_,i)=>255-i).find(n=>{const[start,end]=range('10.'+n+'.0.0/16');return occupied.every(([a,b])=>end<a||start>b);});assert(octet!==undefined,'An unused explicit private prefix is required for configuration-only testing');
 const root=path.resolve(tmpdir()),directory=await mkdtemp(path.join(root,'steward-network-pool-test-')),prefix='10.'+octet;
 try{
  await writeFile(path.join(directory,'manifest.json'),JSON.stringify({project:'steward-network-test-'+randomUUID(),instances:[{key:'master',role:'master'},{key:'worker-1',role:'worker'},{key:'worker-2',role:'worker'},{key:'worker-3',role:'worker'}]}));await mkdir(path.join(directory,'commerce'));await writeFile(path.join(directory,'commerce/manifest.json'),'{}');
  const entry=fileURLToPath(new URL('./configure-network-pool.mjs',import.meta.url)),run=()=>execFileSync(process.execPath,[entry,directory,prefix],{cwd:tmpdir(),stdio:['ignore','pipe','pipe']});run();
  const file=path.join(directory,'network/compose.yaml'),before=await readFile(file,'utf8');assert(!before.includes('  scientific:'));assert(before.includes('subnet: '+prefix+'.13.0/24'));
  await mkdir(path.join(directory,'scientific'));await writeFile(path.join(directory,'scientific/manifest.json'),'{}');run();const after=await readFile(file,'utf8');assert(after.startsWith(before),'All prior explicit allocations must remain byte-for-byte unchanged');assert(after.includes('  scientific:\n    ipam:\n      config:\n        - subnet: '+prefix+'.14.0/24'));assert.equal((after.match(/^  scientific:/gm)??[]).length,1);
 }finally{assert(path.dirname(path.resolve(directory))===root&&path.basename(directory).startsWith('steward-network-pool-test-'));await rm(directory,{recursive:true,force:true});}
});
