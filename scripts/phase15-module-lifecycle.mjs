import assert from 'node:assert/strict';
// ModuleManager install returns installed; activate is a separate reviewed operation.
export async function activatePreparedModule({read,activate,persistStage,wait,expected}){
 const verify=row=>{assert(row,'Prepared module missing');assert.equal(row.version,expected.version);assert.equal(row.operationId,expected.operationId);assert.equal(row.imageId,expected.imageId);assert.notEqual(row.state,'failed','Module installation failed: '+(row.errorCode??'UNKNOWN'));return row;};
 let row=verify(await read());
 if(row.state==='installed'){
  await persistStage('activation-requested');
  await activate();
  row=verify(await wait());
  assert.equal(row.state,'active','Explicit activation did not complete');
  await persistStage('activated-original-configuration');
 }else assert.equal(row.state,'active','Do not automatically re-enable a disabled or incomplete module');
 return row;
}
