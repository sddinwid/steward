import assert from 'node:assert/strict';
export async function stopSelectedWithRecovery({recovery,verifySingleStack,persistRecovery,stopSelected}){
 assert(recovery.originalContainers?.length,'Exact original recovery manifest required');
 assert(recovery.selectedDirectory&&recovery.operatorProject);
 for(const c of recovery.originalContainers)assert(c.id&&c.image&&Array.isArray(c.mounts),'Container image/volume recovery proof required');
 await verifySingleStack();
 await persistRecovery(recovery); // Must finish before stopping even the first original container.
 await stopSelected();
}
