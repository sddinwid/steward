import {ensure,type Data} from './index.js';
export const text=(maxLength=160)=>({type:'string',minLength:1,maxLength,pattern:'\\S'});
export const amount={type:'integer',minimum:0,maximum:100000000000};
export const quantity={type:'integer',minimum:1,maximum:100000000};
export const object=(properties:Data,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
export const choice=(values:string[])=>({type:'string',enum:values});
export const lineSchema=object({sku:text(80),quantity,unitPriceCents:amount});
export const movementLineSchema=object({sku:text(80),quantity});
export const lines=(priced=true)=>({type:'array',minItems:1,maxItems:40,items:priced?lineSchema:movementLineSchema});
export function uniqueLines(value:Data[]){ensure(new Set(value.map(v=>v.sku)).size===value.length,'Each SKU must occur once per document');}
export function centsTotal(value:Data[]){const total=value.reduce((s,v)=>s+v.quantity*v.unitPriceCents,0);ensure(Number.isSafeInteger(total)&&total<=1e14,'Document value exceeds supported bounds');return total;}
export function actionResult(record:Data){return{record};}
