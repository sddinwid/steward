import {setTimeout} from 'node:timers/promises';
// Windows virus scanners/readers can briefly lock an atomic replacement. Retry the same filesystem
// operation, never repeat the simulated business operation or delete the existing state file.
export async function lockedFileOperation<T>(operation:()=>Promise<T>,pause:(ms:number)=>Promise<unknown>=setTimeout){
 for(let attempt=0;;attempt++)try{return await operation();}catch(error){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??''))throw error;await pause(25*(attempt+1));}
}
