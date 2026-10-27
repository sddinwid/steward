import type {CapabilityContract,CapabilityRequirement} from '@steward/module-sdk';
import {arraySchema,closedSchema,textSchema,uuidSchema} from './catalog.js';
import {operationalOfferingSchema,type OperationalOfferingView} from './capabilities.js';

/** Additive capability: the original closed Catalog 1.0 lookup ABI is unchanged. */
export const CATALOG_PRICING_CAPABILITY_ID='catalog.pricing-subjects.read';
export const CATALOG_PRICING_CAPABILITY_CONTRACT='steward.catalog-pricing-subjects';
export const CATALOG_PRICING_CAPABILITY_VERSION='1.0.0';
export interface CatalogPricingLookupResult {contractVersion:1;offering:OperationalOfferingView;promotionEligibility:boolean;promotionGroups:string[]}
export const catalogPricingLookupSchema=closedSchema({contractVersion:{const:1},offering:operationalOfferingSchema,promotionEligibility:{type:'boolean'},promotionGroups:arraySchema(textSchema(80),20)});
export const catalogPricingOperations=[{name:'catalog.pricing.lookup',input:closedSchema({contractVersion:{const:1},offeringId:uuidSchema,variantId:{anyOf:[uuidSchema,{type:'null'}]}}),output:catalogPricingLookupSchema}] as const;
/** Eligibility metadata is not an active price, an approval or production authority. */
export function catalogPricingCapability(moduleId='steward.catalog.universal'):CapabilityContract{return{capabilityId:CATALOG_PRICING_CAPABILITY_ID,contract:CATALOG_PRICING_CAPABILITY_CONTRACT,version:CATALOG_PRICING_CAPABILITY_VERSION,operations:catalogPricingOperations.map(op=>({...op,command:op.name,permission:moduleId+'.read',mode:'durable',idempotency:'required',retry:'safe'})),events:[],sensitivity:'business',scope:'entity',ownership:'provider'};}
export function catalogPricingRequirement(optional=true):CapabilityRequirement{return{capabilityId:CATALOG_PRICING_CAPABILITY_ID,contract:CATALOG_PRICING_CAPABILITY_CONTRACT,minimumVersion:CATALOG_PRICING_CAPABILITY_VERSION,maximumMajor:1,operations:catalogPricingOperations.map(op=>({...op})),events:[],maximumSensitivity:'business',optional};}
