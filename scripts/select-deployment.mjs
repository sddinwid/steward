// One-time workspace selection. Routine operations use docker compose directly.
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function operatorConfig(config,manifest,hook){
 if(config.name!==manifest.project)throw Error('Compose project does not match the installed identity');
 for(const i of manifest.instances){const api=config.services?.[i.key+'-api'],web=config.services?.[i.key+'-web'];
  if(!api?.environment?.STEWARD_SECURITY_FILE||!web?.ports?.some(p=>Number(p.target)===8443&&Number(p.published)===i.webPort+1000))throw Error('Complete HTTPS/security configuration is required');
  const host=config.services?.[i.key+'-module-host'];if(host){if(!host.environment?.MODULE_HOST_CONFIG)throw Error('Module host identity configuration is missing');host.volumes??=[];host.volumes.push({type:'bind',source:hook,target:'/etc/steward/compose-stop-modules.mjs',read_only:true});host.pre_stop=[...(host.pre_stop??[]),{command:['node','/etc/steward/compose-stop-modules.mjs']}];}
 }
 return config;
}
export function selectionEnv(existing,project){
 const settings={STEWARD_COMPOSE_PROJECT:project,STEWARD_COMPOSE_ENTRYPOINT:'./.steward/operator/compose.json'};
 let text=existing;for(const [key,value]of Object.entries(settings)){const re=new RegExp('^'+key+'=.*$','m');text=re.test(text)?text.replace(re,key+'='+value):text.replace(/\s*$/,'')+'\n'+key+'='+value+'\n';}return text.replace(/^\n/,'');
}
export async function selectDeployment(input){
 const directory=path.resolve(input),manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(manifest.project??'')||!Array.isArray(manifest.instances)||!manifest.instances.length)throw Error('Invalid installed deployment');
 for(const file of ['security/compose.yaml','release/compose.yaml'])if(!existsSync(path.join(directory,file)))throw Error('Select a secured, installed release; missing '+file+'. No state was changed.');
 const files=['compose.yaml','network/compose.yaml','security/compose.yaml','modules/compose.yaml','data/compose.yaml','analyst/compose.yaml','scientific/compose.yaml','commerce/compose.yaml','mission/compose.yaml','economy/compose.yaml','release/compose.yaml'].filter(f=>existsSync(path.join(directory,f)));
 const args=['compose','-p',manifest.project,...files.flatMap(f=>['-f',path.join(directory,f)]),'config','--format','json'];
 const config=operatorConfig(JSON.parse(execFileSync('docker',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})),manifest,path.join(root,'scripts/compose-stop-modules.mjs').replaceAll('\\','/'));
 const target=path.join(root,'.steward/operator');await mkdir(target,{recursive:true,mode:0o700});
 await writeFile(path.join(target,'compose.json'),JSON.stringify(config,null,2)+'\n',{mode:0o600});
 await writeFile(path.join(target,'selection.json'),JSON.stringify({version:1,directory,project:manifest.project,files},null,2)+'\n',{mode:0o600});
 const env=path.join(root,'.env');await writeFile(env,selectionEnv(existsSync(env)?await readFile(env,'utf8'):'',manifest.project),{mode:0o600});
 console.log('Selected existing deployment '+manifest.project+'. No accounts, identities, databases or module configuration were changed.');
 console.log('Routine commands: docker compose up -d; docker compose down; docker compose logs -f; docker compose ps');
 for(const i of manifest.instances)console.log(i.key+': https://'+i.key+'.localhost:'+(i.webPort+1000));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{if(!process.argv[2])throw Error('Usage: node scripts/select-deployment.mjs EXISTING_DEPLOYMENT_DIRECTORY');await selectDeployment(process.argv[2]);}catch(e){console.error(e.message);process.exitCode=1;}}
