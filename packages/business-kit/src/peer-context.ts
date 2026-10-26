/** Only the private authenticated module host may supply this attestation. */
export interface AttestedPeerScope {
 sourceEntityId:string;sourceInstallationId:string;sourceProgramId:string;
 destinationEntityId:string;destinationInstallationId:string;destinationProgramId:string;
 consumerModuleId:string;purpose:string;grantId:string;providerInstallationId:string;packageDigest:string;
 expiresAt:number;sourceActorId:string;destinationActorId:string;
}
export function parsePeerScope(value:unknown,now=Date.now()):AttestedPeerScope|undefined{
 if(value===undefined)return undefined;
 const deny=():never=>{throw Object.assign(new Error('Private peer authority is unavailable'),{statusCode:403});};
 if(typeof value!=='string'||value.length>4096)deny();let scope:any;try{scope=JSON.parse(value as string);}catch{deny();}
 const ids=['sourceEntityId','sourceInstallationId','sourceProgramId','destinationEntityId','destinationInstallationId','destinationProgramId','grantId','providerInstallationId','sourceActorId','destinationActorId'];
 const all=[...ids,'consumerModuleId','purpose','packageDigest','expiresAt'],uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
 if(!scope||Array.isArray(scope)||typeof scope!=='object'||Object.keys(scope).length!==all.length||Object.keys(scope).some(k=>!all.includes(k))||ids.some(k=>typeof scope[k]!=='string'||!uuid.test(scope[k]))||![scope.consumerModuleId,scope.purpose].every(v=>typeof v==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(v))||typeof scope.packageDigest!=='string'||!/^[a-f0-9]{64}$/.test(scope.packageDigest)||!Number.isSafeInteger(scope.expiresAt)||scope.expiresAt<=now||scope.expiresAt>now+31*86400000)deny();
 return Object.freeze(scope) as AttestedPeerScope;
}
