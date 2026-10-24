// Optional operator-selected private subnets for hosts whose Docker default pool is exhausted.
// Existing networks are preserved; this never prunes networks or touches volumes.
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const directory=path.resolve(process.argv[2]??'.steward/dev'),prefix=process.argv[3];
if(!/^10\.(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(prefix??''))throw new Error('Choose a private prefix, e.g. 10.241');
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
const names=[...manifest.instances.flatMap(i=>[i.key,i.key+'-data',...(i.role==='worker'?[i.key+'-modules']:[])]),'enrollment',...(existsSync(path.join(directory,'commerce/manifest.json'))?['commerce-simulators']:[])];
const ids=execFileSync('docker',['network','ls','-q'],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);
const networks=ids.length?JSON.parse(execFileSync('docker',['network','inspect',...ids],{encoding:'utf8'})):[];
const lines=[];
function range(cidr){const [ip,bits]=cidr.split('/'),n=ip.split('.').reduce((n,v)=>n*256+Number(v),0),size=2**(32-Number(bits)),start=Math.floor(n/size)*size;return[start,start+size-1];}
for(const [index,name]of names.entries()){
 if(networks.some(n=>n.Name===manifest.project+'_'+name))continue;
 const subnet=prefix+'.'+(index+1)+'.0/24',bounds=range(subnet);
 for(const network of networks)for(const config of network.IPAM?.Config??[]){if(!config.Subnet||config.Subnet.includes(':'))continue;const occupied=range(config.Subnet);if(bounds[0]<=occupied[1]&&occupied[0]<=bounds[1])throw new Error('Chosen subnet overlaps an existing network: '+subnet);}
 lines.push(`  ${name}:\n    ipam:\n      config:\n        - subnet: ${subnet}`);
}
if(!lines.length){console.log('All deployment networks already exist; preserved their allocation.');process.exit(0);}
await mkdir(path.join(directory,'network'),{recursive:true});
const file=path.join(directory,'network/compose.yaml'),prior=existsSync(file)?await readFile(file,'utf8'):'networks:\n';
const additions=lines.filter(line=>!prior.includes(line.split('\n')[0]+'\n'));
await writeFile(file,prior+additions.join('\n')+'\n');
console.log('Configured '+lines.length+' missing networks. Existing networks, containers and volumes preserved.');
