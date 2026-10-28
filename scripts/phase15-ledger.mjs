import assert from 'node:assert/strict';
import path from 'node:path';
import {rename} from 'node:fs/promises';

// Retry only publication of the already-prepared snapshot. Never regenerate intent IDs.
export async function publishPreparedLedger(source,target,move=rename,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 assert.notEqual(path.resolve(source),path.resolve(target));
 assert.equal(path.dirname(path.resolve(source)),path.dirname(path.resolve(target)),'Ledger snapshot must be a sibling');
 for(let attempt=0;;attempt++){
  try{await move(source,target);return;}
  catch(error){if(!['EPERM','EBUSY'].includes(error.code)||attempt>=7)throw error;await pause(Math.min(100*2**attempt,2000));}
 }
}
