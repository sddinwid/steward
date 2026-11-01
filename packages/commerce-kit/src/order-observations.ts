import type {CapabilityContract,CapabilityRequirement} from '@steward/module-sdk';
import {object,str,identifier} from './contracts.js';
const nullable=(s:unknown)=>({anyOf:[s,{type:'null'}]});
const timestamp=nullable(str(40)),mode={enum:['live','simulator']};
export const orderReadCapabilityId='commerce.printify.orders.read';
export const orderConnectionSchema=object({connectionId:str(),accountId:str(),mode,originDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},state:{enum:['ready','stale','unavailable','incomplete']},observedAt:timestamp,expiresAt:timestamp});
const observation=object({sourceRecordId:identifier,sourceStreamId:{const:'printify_order_observations_v1'},sourceRevision:{type:'integer',minimum:1},remoteOrderId:str(),shopOrderId:str(),status:str(),tracking:{type:'array',items:str(200),maxItems:40},currency:nullable({type:'string',pattern:'^[A-Z]{3}$'})});
const page={offset:{type:'integer',minimum:0,maximum:100000},limit:{type:'integer',minimum:1,maximum:20}};
export const orderReadOperations=[
 {name:'order-observations.connections',input:object({contractVersion:{const:1},...page}),output:object({contractVersion:{const:1},connections:{type:'array',items:orderConnectionSchema,maxItems:20},nextOffset:nullable(page.offset)})},
 {name:'order-observations.lookup',input:object({contractVersion:{const:1},connectionId:str(),accountId:str(),originDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},shopOrderId:{type:'string',pattern:'^[0-9]+$'},...page}),output:object({contractVersion:{const:1},connection:orderConnectionSchema,status:{enum:['ok','stale','unavailable','incomplete']},shopOrderId:{type:'string',pattern:'^[0-9]+$'},items:{type:'array',items:observation,maxItems:20},nextOffset:nullable(page.offset)})}
];
export function orderReadCapability():CapabilityContract{return{capabilityId:orderReadCapabilityId,contract:'steward.order-observations',version:'1.0.0',operations:orderReadOperations.map(o=>({...o,permission:'cee.printify.read',command:o.name,mode:'durable',idempotency:'required',retry:'safe'})),events:[],sensitivity:'business',scope:'entity',ownership:'provider'};}
export function orderReadRequirement():CapabilityRequirement{return{capabilityId:orderReadCapabilityId,contract:'steward.order-observations',minimumVersion:'1.0.0',maximumMajor:1,operations:orderReadOperations,events:[],maximumSensitivity:'business',optional:true};}
export function orderMatchState(status:string,items:unknown[],nextOffset:number|null){if(status!=='ok')return status;if(nextOffset!==null)return'incomplete';return items.length?'matched':'no_observed_match';}
