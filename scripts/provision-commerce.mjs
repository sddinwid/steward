// Additive versioned connector ingress/trust and optional explicitly synthetic services.
import {mkdir,readFile,writeFile,rename,mkdtemp,rmdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {privateDirectory} from '../tools/installer/dist/security.js';
const directory=path.resolve(process.argv[2]??'.steward/dev'),simulators=process.argv.includes('--simulators'),target=path.join(directory,'commerce');
const simulatorCurrency=process.env.STEWARD_SIMULATOR_CURRENCY??'EUR';if(!/^(EUR|USD|GBP|CAD|AUD|NZD)$/.test(simulatorCurrency))throw new Error('Invalid simulator currency');
const deployment=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')),workers=deployment.instances.filter(i=>i.role==='worker');
const q=v=>JSON.stringify(v.replaceAll('\\','/')),slug=id=>'m_'+createHash('sha256').update(id).digest('hex').slice(0,20);
const lock=path.join(directory,'.commerce-provision-lock');await mkdir(lock);
try{
 if(existsSync(target)){
  const previous=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8'));if(![1,2].includes(previous.version)||JSON.stringify(previous.installations)!==JSON.stringify(deployment.instances.map(i=>i.installationId))||simulators!==previous.simulators)throw new Error('Commerce topology differs; existing configuration was preserved. Use a separate deployment or the original provisioning mode.');
  for(const file of previous.files)await readFile(path.join(target,file));
  if(previous.version===1&&simulators){const composeFile=path.join(target,'compose.yaml'),old=await readFile(composeFile,'utf8');await writeFile(composeFile,old.replaceAll('    networks: [','    networks: [commerce-simulators, ')+'networks:\n  commerce-simulators: {}\n');previous.version=2;await writeFile(path.join(target,'manifest.json'),JSON.stringify(previous,null,2)+'\n');}
  console.log('Preserved connector ingress, identities, simulator data and private configuration.');
 }else{
  const staging=await mkdtemp(path.join(directory,'.commerce-staging-'));privateDirectory(staging);const services=[],files=[];
  const put=async(file,data,privateFile=false)=>{await mkdir(path.dirname(path.join(staging,file)),{recursive:true});await writeFile(path.join(staging,file),data,{mode:privateFile?0o600:0o644});files.push(file);};
  for(const i of deployment.instances){
   const original=await readFile(path.join(directory,'analyst',i.key,'nginx.conf'),'utf8');await put(i.key+'/nginx.conf',original.replace('location /api/v5/','location /api/v8/ { proxy_read_timeout 90s; client_max_body_size 192k; proxy_pass $secure_backend; }\n  location /api/v5/'));
   services.push(`  ${i.key}-web:\n    volumes:\n      - type: bind\n        source: ${q(path.join(target,i.key,'nginx.conf'))}\n        target: /etc/nginx/conf.d/security.conf\n        read_only: true`);
   if(i.role==='worker'){
    const host=JSON.parse(await readFile(path.join(directory,'modules',i.key,'host.json'),'utf8'));host.connectorSecretsRoot='/run/operator-connectors';await put(i.key+'/host.json',JSON.stringify(host,null,2)+'\n');await mkdir(path.join(staging,'private',i.key),{recursive:true});
    services.push(`  ${i.key}-module-host:\n    volumes:\n      - type: bind\n        source: ${q(path.join(target,i.key,'host.json'))}\n        target: /etc/steward/module-host.json\n        read_only: true\n      - type: bind\n        source: ${q(path.join(target,'private',i.key))}\n        target: /run/operator-connectors\n        read_only: true`);
   }
  }
  const offset=deployment.instances[0].apiPort-(deployment.instances[0].role==='master'?4100:4200+Number(deployment.instances[0].key.split('-')[1]));
  if(simulators){
   if(offset+18444>65535)throw new Error('Simulator port range exceeds 65535; choose a smaller installation port offset');
   const caPem=await readFile(path.join(directory,'security/ca-cert.pem'),'utf8');
   for(const [provider,port]of [['shopify',18443+offset],['printify',18444+offset]]){
    await mkdir(path.join(staging,'private',provider),{recursive:true});const base=path.join(staging,'private',provider),openssl=process.env.STEWARD_OPENSSL??(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
    const run=args=>execFileSync(openssl,args,{env:{...process.env,OPENSSL_CONF:path.join(directory,'security/openssl.cnf')},stdio:'ignore'});
    run(['req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-subj','/CN='+provider+'-simulator','-keyout',base+'/tls-key.pem','-out',base+'/tls.csr']);
    await writeFile(base+'/extensions.cnf',`subjectAltName=DNS:${provider}-simulator\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\n`);
    run(['x509','-req','-in',base+'/tls.csr','-CA',path.join(directory,'security/ca-cert.pem'),'-CAkey',path.join(directory,'security/ca-key.pem'),'-set_serial','0x'+randomBytes(12).toString('hex'),'-days','90','-extfile',base+'/extensions.cnf','-out',base+'/tls-cert.pem']);
    files.push('private/'+provider+'/tls-key.pem','private/'+provider+'/tls-cert.pem');
    const accounts=[];
    for(const [n,i]of workers.entries()){
     const token=randomBytes(32).toString('hex'),webhookSecret=randomBytes(32).toString('hex'),shopId=String(1001+n),shopDomain='synthetic-'+i.installationId.slice(0,8)+'.myshopify.com';
     accounts.push({shopId,shopDomain,token,webhookSecret,currency:simulatorCurrency,scopes:provider==='shopify'?['read_products','read_orders','write_merchant_managed_fulfillment_orders']:['orders.write']});
     await put('private/'+i.key+'/'+slug('cee.'+provider)+'.json',JSON.stringify({provider,mode:'simulator',baseUrl:`https://${provider}-simulator:8443/`,caPem,serverName:provider+'-simulator',token,webhookSecret,shopId,shopDomain,productionEnabled:true,syntheticAddress:{first_name:'Synthetic',last_name:'Demonstration',email:'demonstration@example.invalid',country:'US',region:'CA',address1:'Synthetic address',city:'Synthetic',zip:'00000'}},null,2)+'\n',true);
    }
    const config={provider,adminToken:randomBytes(32).toString('hex'),accounts,caPem,tlsKeyFile:'/run/simulator/tls-key.pem',tlsCertFile:'/run/simulator/tls-cert.pem'};await put('private/'+provider+'/config.json',JSON.stringify(config,null,2)+'\n',true);
    const health=`const h=require('node:https'),c=JSON.parse(require('node:fs').readFileSync('/run/simulator/config.json'));h.get({hostname:'127.0.0.1',port:8443,path:'/health',ca:c.caPem,servername:'${provider}-simulator',rejectUnauthorized:true},r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1));`;
    services.push(`  ${provider}-simulator:\n    image: steward-commerce-simulator:1.0.0\n    pull_policy: never\n    restart: unless-stopped\n    user: "1000:1000"\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n    mem_limit: 128m\n    pids_limit: 100\n    environment:\n      SIMULATOR_CONFIG_FILE: /run/simulator/config.json\n    volumes:\n      - ${provider}-simulator:/var/lib/simulator\n      - type: bind\n        source: ${q(path.join(target,'private',provider))}\n        target: /run/simulator\n        read_only: true\n    ports: ["127.0.0.1:${port}:8443"]\n    networks: [commerce-simulators, ${workers.map(i=>i.key+'-modules').join(', ')}]\n    healthcheck:\n      test: ${JSON.stringify(['CMD','node','-e',health])}\n      interval: 5s\n      timeout: 4s\n      retries: 20`);
   }
  }
  await put('compose.yaml','# Steward connector provisioning v1; all simulator services are synthetic.\nservices:\n'+services.join('\n')+'\n'+(simulators?'volumes:\n  shopify-simulator: {}\n  printify-simulator: {}\nnetworks:\n  commerce-simulators: {}\n':''));
  await put('manifest.json',JSON.stringify({version:2,installations:deployment.instances.map(i=>i.installationId),simulators,ports:simulators?{shopify:18443+offset,printify:18444+offset}:{},files},null,2)+'\n');
  await rename(staging,target);console.log('Created connector ingress and private configuration'+(simulators?' with explicitly synthetic Shopify/Printify simulators.':'; no commercial credential or simulator was configured.'));
 }
}finally{await rmdir(lock);}
