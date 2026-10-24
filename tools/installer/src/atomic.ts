import {lstat,rename} from 'node:fs/promises';
import path from 'node:path';

// Windows scanners can briefly hold a just-written private staging directory.
// Keep the prepared identity/configuration intact and retry only the atomic rename.
export async function publishDirectory(source:string,target:string,move:typeof rename=rename):Promise<void>{
 if(path.dirname(path.resolve(source))!==path.dirname(path.resolve(target)))throw new Error('Publication requires sibling directories');
 for(let attempt=0;;attempt++){
  try{await lstat(target);throw Object.assign(new Error('Publication target already exists; existing configuration preserved'),{code:'EEXIST'});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  try{await move(source,target);return;}
  catch(error){if(!['EPERM','EBUSY'].includes((error as NodeJS.ErrnoException).code??'')||attempt>=7)throw error;await new Promise(resolve=>setTimeout(resolve,Math.min(100*2**attempt,2000)));}
 }
}
