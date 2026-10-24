import type { CapabilityContract, CapabilityRequirement } from '@steward/module-sdk';
export const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
export const str=(maxLength=120)=>({type:'string',minLength:1,maxLength,pattern:'\\S'});
export const integer={type:'integer',minimum:0,maximum:1000000000000};
export const identifier={type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'};
export const list=(items:unknown,maxItems=40)=>({type:'array',minItems:1,maxItems,items});
const line=object({sku:str(80),quantity:{type:'integer',minimum:1,maximum:100000000}});
export const productLine=object({sourceVariantId:str(),sku:str(80),quantity:{type:'integer',minimum:1,maximum:100000000},unitPriceCents:integer,lineRevenueCents:integer});
export const contracts:Record<string,{id:string;contract:string;operations:{name:string;input:any;output:any}[]}>= {
 stock:{id:'inventory.stock.reserve',contract:'steward.stock-reservations',operations:[
  {name:'stock.reserve',input:object({orderId:identifier,lines:list(line)}),output:object({orderId:identifier,lines:list(object({sku:str(80),requested:integer,availableBefore:integer,reserved:integer}))})},
  {name:'stock.release',input:object({orderId:identifier}),output:object({orderId:identifier,released:{const:true}})},
  {name:'stock.consume',input:object({orderId:identifier,fulfillmentId:identifier,lines:list(line)}),output:object({orderId:identifier,fulfillmentId:identifier,applied:{const:true}})}]},
 orders:{id:'commerce.orders.manage',contract:'steward.channel-order',operations:[{name:'commerce.order.import',input:object({sourceId:str(),sourceCreatedAt:str(40),sourceUpdatedAt:str(40),channel:str(80),currency:{type:'string',pattern:'^[A-Z]{3}$'},financialStatus:{type:'string',enum:['pending','paid','refunded','partially_refunded','authorized','partially_paid','voided','expired']},fulfillmentStatus:str(80),canceled:{type:'boolean'},refundCents:integer,lines:list(productLine)}),output:object({orderId:identifier,status:str(80)})}]},
 production:{id:'fulfillment.orders.submit',contract:'steward.production-intent',operations:[{name:'fulfillment.submit',input:object({orderId:identifier,currency:{type:'string',pattern:'^[A-Z]{3}$'},lines:list(line)}),output:object({jobId:identifier,status:{const:'awaiting_authorization'}})},{name:'fulfillment.cancel',input:object({orderId:identifier}),output:object({canceled:{type:'boolean'}})}]},
 status:{id:'commerce.orders.fulfillment',contract:'steward.production-progress',operations:[{name:'fulfillment.progress',input:object({orderId:identifier,sourceId:str(),status:{type:'string',enum:['pending','in_production','shipped','failed']},updatedAt:str(40),productionCostCents:{anyOf:[integer,{type:'null'}]},shippingCostCents:{anyOf:[integer,{type:'null'}]},costBasis:{type:'string',enum:['estimated','known','incomplete']},currency:{type:'string',pattern:'^[A-Z]{3}$'},tracking:str(160)}),output:object({recorded:{const:true}})}]},
 channel:{id:'commerce.channel.fulfillment',contract:'steward.channel-fulfillment',operations:[{name:'channel.fulfillment',input:object({sourceId:str(),orderId:identifier,tracking:str(160),lines:list(line)}),output:object({queued:{const:true}})}]}
};
export function consumes(key:string,optional=false):CapabilityRequirement{const c=contracts[key]!;return{capabilityId:c.id,contract:c.contract,minimumVersion:'1.0.0',maximumMajor:1,operations:c.operations,events:[],maximumSensitivity:'business',optional};}
export function provides(key:string,moduleId:string,permission='write'):CapabilityContract{const c=contracts[key]!;return{capabilityId:c.id,contract:c.contract,version:'1.0.0',operations:c.operations.map(o=>({...o,command:o.name,permission:moduleId+'.'+permission,mode:'durable',idempotency:'required',retry:'safe'})),events:[],sensitivity:'business',scope:'entity',ownership:'provider'};}
