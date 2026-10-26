import type {ApiContribution,ScreenContribution} from '@steward/module-sdk';
export type ModuleField=ScreenContribution['fields'][number];
export type ReferenceApi=(path:string,method?:string)=>Promise<any>;
export interface ReferenceChoice {value:string;label:string;currency?:string}
export interface ReferenceChoices {status:'loading'|'ready'|'unavailable';choices:ReferenceChoice[];truncated:boolean;message:string}
export const MAX_REFERENCE_CHOICES=200;
export const REFERENCE_PAGE_SIZE=20;
const MAX_REFERENCE_PAGES=10;
const safeField=(name:string)=>typeof name==='string'&&/^[a-z][a-zA-Z0-9_]{0,49}$/.test(name)&&!['constructor','prototype','__proto__'].includes(name);
export const unavailableReference=():ReferenceChoices=>({status:'unavailable',choices:[],truncated:false,message:'Choices are unavailable. You may need permission to read the related records.'});
export function referenceOperation(moduleId:string,operations:ApiContribution[],field:ModuleField):ApiContribution|null{
 const ref=field.reference;if(!ref||field.type!=='string'||!safeField(ref.valueField)||!safeField(ref.labelField)||ref.currencyField!==undefined&&!safeField(ref.currencyField)||!(/^[a-z][a-z0-9.-]{0,79}$/.test(moduleId)))return null;
 const op=operations.find(o=>o.operationId===ref.operationId);
 return op?.method==='GET'&&/^\/[a-z][a-z0-9-]*$/.test(op.path)&&typeof op.permission==='string'&&op.permission.startsWith(moduleId+'.')?op:null;
}
/** Only opaque identifiers are generated here; modules retain validation and
 * authority. A creation reset produces new identifiers; editing does not. */
export function moduleFormDefaults(fields:ModuleField[],currency:string,uuid:()=>string=()=>crypto.randomUUID()):Record<string,unknown>{
 const values:Record<string,unknown>={currency};for(const f of fields){if(f.default!==undefined)values[f.name]=f.default;if(f.generate){const id=uuid();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))throw new Error('A secure identifier could not be generated');values[f.name]=f.generate==='uuid'?id:(f.generate==='synthetic-participant'?'SYN-PART-':'SYNREF-')+id.replaceAll('-','').toUpperCase();}}return values;
}
export function moduleEditValues(record:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(record).map(([key,value])=>[key,/Cents$/.test(key)&&typeof value==='number'?value/100:value]));}
function choice(record:any,field:ModuleField):ReferenceChoice|null{
 const ref=field.reference!;if(!record||typeof record!=='object'||!Object.hasOwn(record,ref.valueField)||!Object.hasOwn(record,ref.labelField))return null;
 const value=record[ref.valueField],name=record[ref.labelField];if(typeof value!=='string'||!value.length||value.length>200||!['string','number'].includes(typeof name)||typeof name==='number'&&!Number.isFinite(name))return null;
 let label=String(name).replace(/[\u0000-\u001f]/g,' ').trim().slice(0,240);if(!label)return null;
 const currency=ref.currencyField?record[ref.currencyField]:undefined;if(ref.currencyField&&(typeof currency!=='string'||! /^[A-Z]{3}$/.test(currency)))return null;
 const synthetic=record.synthetic===true||/^(SYN-PART-|SYNREF-)/.test(value);if(synthetic&&!/synthetic/i.test(label))label+=' · Synthetic';return{value,label,...(currency?{currency}:{})};
}
/** Read only same-module operations in the permission-filtered discovery result.
 * Backend pagination stays authoritative; only value/label pairs are retained. */
export async function loadReferenceChoices(api:ReferenceApi,moduleId:string,operations:ApiContribution[],field:ModuleField):Promise<ReferenceChoices>{
 const op=referenceOperation(moduleId,operations,field);if(!op)return unavailableReference();
 const base='/v3/modules/'+encodeURIComponent(moduleId)+'/api'+op.path,paginated=Array.isArray(op.query)&&op.query.includes('limit')&&op.query.includes('offset');
 const result=new Map<string,ReferenceChoice>();let offset=0,truncated=false,omitted=false;
 try{for(let page=0;page<MAX_REFERENCE_PAGES;page++){
   const params=paginated?'?'+new URLSearchParams({limit:String(REFERENCE_PAGE_SIZE),offset:String(offset)}).toString():'';
   const value=await api(base+params,'GET');if(!value||!Array.isArray(value.records))return unavailableReference();
   for(const row of value.records.slice(0,MAX_REFERENCE_CHOICES)){const option=choice(row,field);if(!option){omitted=true;continue;}if(!result.has(option.value)&&result.size===MAX_REFERENCE_CHOICES){truncated=true;break;}result.set(option.value,option);}
   if(value.records.length>MAX_REFERENCE_CHOICES)truncated=true;
   const next=value.nextOffset;if(!paginated||next===null||next===undefined)break;
   if(!Number.isSafeInteger(next)||next<=offset||next>100000)return unavailableReference();
   if(result.size>=MAX_REFERENCE_CHOICES||page+1===MAX_REFERENCE_PAGES){truncated=true;break;}offset=next;
  }
  return{status:'ready',choices:[...result.values()],truncated,message:truncated?'Showing up to 200 authorized choices. If the required record is absent, narrow the related collection or ask an administrator.':omitted?'Some related records have no usable label and were omitted.':result.size?'':'No authorized related records are available yet. Create a suitable record or ask for access.'};
 }catch{return unavailableReference();}
}
export function referenceSelectionValid(field:ModuleField,value:unknown,state:ReferenceChoices|undefined,existingValue?:unknown):boolean{
 if(!field.reference)return true;if(existingValue!==undefined&&existingValue!==''&&value===existingValue)return true;if((value===undefined||value===null||value==='')&&!field.required)return true;
 return state?.status==='ready'&&state.choices.some(c=>c.value===value);
}

/** Parse display money using exact decimal digits; never round a submitted amount. */
export function moduleNumericValue(field:ModuleField,raw:unknown):number{
 if(!/Cents$/.test(field.name)){const value=Number(raw);if(!Number.isFinite(value))throw Error('Enter a finite number for '+field.label);return value;}
 let text=String(raw);if(text.startsWith('.'))text='0'+text;if(text.startsWith('-.'))text='-0'+text;
 if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text))throw Error('Enter '+field.label+' as an exact amount with at most two decimal places.');
 const negative=text.startsWith('-'),[whole,fraction='']=(negative?text.slice(1):text).split('.'),minor=(BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0')))*(negative?-1n:1n);
 if(minor>BigInt(Number.MAX_SAFE_INTEGER)||minor<BigInt(Number.MIN_SAFE_INTEGER))throw Error('Amount exceeds exact integer bounds.');return Number(minor);
}
export function moduleFormCurrency(screen:ScreenContribution,values:Record<string,any>,choices:Record<string,ReferenceChoices>,fallback:string):string|undefined{
 if(!screen.currencyReference)return typeof values.currency==='string'?values.currency:fallback;
 return choices[screen.currencyReference]?.choices.find(c=>c.value===values[screen.currencyReference!])?.currency;
}
