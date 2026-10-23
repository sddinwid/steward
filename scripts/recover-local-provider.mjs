// Explicit recovery only after the recorded provider process has exited.
import {readFile,writeFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
const directory=path.resolve(process.argv[2]??'.steward/dev'),file=path.join(directory,'analyst/local-provider-recovery.json');
try{
 const r=JSON.parse(await readFile(file,'utf8'));let alive=true;
 try{process.kill(r.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
 if(alive)throw new Error('Recorded provider process is still active; do not overwrite its configuration');
 JSON.parse(Buffer.from(r.config,'base64').toString());
 await writeFile(path.join(directory,'analyst/config/model.json'),Buffer.from(r.config,'base64'));
 await writeFile(path.join(directory,'analyst/config/api-key.txt'),Buffer.from(r.key,'base64'));
 const stop=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:r.model,keep_alive:0}),signal:AbortSignal.timeout(10000)});await stop.text();
 if(!stop.ok)throw new Error('Configuration restored; model unload failed. Start Ollama and rerun recovery');
 await unlink(file);await rmdir(path.join(directory,'analyst/.local-provider-lock'));
 console.log('PASS exact original provider configuration restored and temporary model unloaded.');
}catch(e){console.error('Provider recovery stopped: '+e.message);process.exitCode=1;}
