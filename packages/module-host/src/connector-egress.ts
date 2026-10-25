import {digest,type SignedModulePackage} from '@steward/module-sdk';
import {readFile} from 'node:fs/promises';
// Presence/JSON preflight only; authentication and provider schemas stay module-owned.
export async function requireConnectorConfiguration(file?:string){
 if(!file)deny('CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED');
 let raw:string;try{raw=await readFile(file,'utf8');}catch{deny('CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED');}
 try{const value=JSON.parse(raw);if(Buffer.byteLength(raw)>131072||!value||typeof value!=='object'||Array.isArray(value))deny('CONNECTOR_PRIVATE_CONFIGURATION_INVALID');}catch{deny('CONNECTOR_PRIVATE_CONFIGURATION_INVALID');}
}
function deny(code:string):never{throw Object.assign(new Error(code),{code});}
export interface EgressIdentity {project:string;workerKey:string;installationId:string}
export interface ConnectorEgressGrant {network:string;imageId:string}
export function connectorNetworkName(identity:EgressIdentity,moduleId:string){return identity.project+'_'+identity.workerKey+'-egress-m_'+digest(moduleId).slice(0,20);}
export function plannedConnectorEgress(identity:EgressIdentity,descriptor:SignedModulePackage,configuration:any,grants:Record<string,ConnectorEgressGrant>={}){
 const module=descriptor.payload.manifest,id=module.moduleId;if(!module.connector||configuration?.mode!=='live')return undefined;
 const grant=grants[id];if(!grant)deny('CONNECTOR_EGRESS_GRANT_REQUIRED');if(grant.imageId!==descriptor.payload.imageId||grant.network!==connectorNetworkName(identity,id))deny('CONNECTOR_EGRESS_GRANT_MISMATCH');return grant.network;
}
export function validateEgressNetwork(identity:EgressIdentity,moduleId:string,network:any){if(network.Name!==connectorNetworkName(identity,moduleId)||network.Internal!==false||network.Driver!=='bridge'||network.Labels?.['steward.egress.installation']!==identity.installationId||network.Labels?.['steward.egress.module']!==moduleId)deny('CONNECTOR_EGRESS_NETWORK_UNTRUSTED');}
