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
 const values:Record<string,unknown>={currency};for(const f of fields){if(f.default!==undefined)values[f.name]=f.default;if(['object','array','boolean'].includes(f.type)||f.format==='money')values[f.name]=moduleFieldDefault(f);if(f.generate){const id=uuid();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))throw new Error('A secure identifier could not be generated');values[f.name]=f.generate==='uuid'?id:(f.generate==='synthetic-participant'?'SYN-PART-':'SYNREF-')+id.replaceAll('-','').toUpperCase();}}return values;
}
export function moduleEditValues(record:Record<string,unknown>,fields?:ModuleField[]):Record<string,unknown>{return Object.fromEntries(Object.entries(record).map(([key,value])=>{const field=fields?.find(f=>f.name===key);return[key,field?moduleDisplayValue(field,value):/Cents$/.test(key)&&typeof value==='number'?value/100:value];}));}
function moduleDisplayValue(field:ModuleField,value:any):any{
 if(value===null||value===undefined)return value;
 if(field.type==='number'&&(field.format==='money'||/Cents$/.test(field.name)))return exactMoneyDisplay(value);
 if(field.type==='object'&&typeof value==='object')return moduleEditValues(value,field.fields);
 if(field.type==='array'&&Array.isArray(value)&&field.items)return value.map(v=>moduleDisplayValue(field.items!,v));return value;
}
export function exactMoneyDisplay(value:unknown):string{if(!Number.isSafeInteger(value))throw Error('Stored amount exceeds exact integer bounds.');const n=BigInt(value as number),v=n<0n?-n:n;return(n<0n?'-':'')+String(v/100n)+'.'+String(v%100n).padStart(2,'0');}

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
 if(!/Cents$/.test(field.name)&&field.format!=='money'){const value=Number(raw);if(!Number.isFinite(value))throw Error('Enter a finite number for '+field.label);return value;}
 let text=String(raw);if(text.startsWith('.'))text='0'+text;if(text.startsWith('-.'))text='-0'+text;
 if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text))throw Error('Enter '+field.label+' as an exact amount with at most two decimal places.');
 const negative=text.startsWith('-'),[whole,fraction='']=(negative?text.slice(1):text).split('.'),minor=(BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0')))*(negative?-1n:1n);
 if(minor>BigInt(Number.MAX_SAFE_INTEGER)||minor<BigInt(Number.MIN_SAFE_INTEGER))throw Error('Amount exceeds exact integer bounds.');return Number(minor);
}
export function moduleFormCurrency(screen:ScreenContribution,values:Record<string,any>,choices:Record<string,ReferenceChoices>,fallback:string):string|undefined{
 if(!screen.currencyReference)return typeof values.currency==='string'?values.currency:fallback;
 return choices[screen.currencyReference]?.choices.find(c=>c.value===values[screen.currencyReference!])?.currency;
}

/** Conditions select presentation only. The module validates the complete submitted contract. */
export function moduleFieldVisible(field:ModuleField,values:Record<string,any>):boolean{return !field.visibleWhen||values[field.visibleWhen.field]===field.visibleWhen.equals;}
export function moduleFieldDefault(field:ModuleField):any{
 if(field.generate)return moduleFormDefaults([field],'')[field.name];
 if(field.default!==undefined)return field.type==='number'&&(field.format==='money'||/Cents$/.test(field.name))?exactMoneyDisplay(field.default):field.default;
 if(field.type==='array')return [];if(field.type==='object')return Object.fromEntries((field.fields??[]).filter(f=>!f.readOnly).map(f=>[f.name,moduleFieldDefault(f)]));if(field.type==='boolean')return false;return '';
}
export function moduleReferenceFields(fields:ModuleField[],prefix=''):Array<{field:ModuleField;path:string}>{return fields.flatMap(field=>{const path=prefix+field.name;return [...(field.reference?[{field,path}]:[]),...(field.fields?moduleReferenceFields(field.fields,path+'.'):[]),...(field.items?moduleReferenceFields([field.items],path+'[].'):[])];});}
export function moduleFormBody(fields:ModuleField[],values:Record<string,any>,choices:Record<string,ReferenceChoices>,existing:Record<string,any>={},prefix=''):Record<string,any>{
 const output:Record<string,any>={};for(const f of fields){if(f.readOnly||!moduleFieldVisible(f,values))continue;const raw=values[f.name],path=prefix+f.name;if(!f.required&&(raw===undefined||raw===null||raw===''||f.type==='object'&&moduleObjectEmpty(f,raw)))continue;output[f.name]=moduleFieldValue(f,raw,choices,existing[f.name],path);}return output;
}
/** Optional groups remain absent until a visible declared value is entered. Zero and false count as entered. */
export function moduleObjectEmpty(field:ModuleField,value:any):boolean{
 if(value===undefined||value===null||value==='')return true;
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 return(field.fields??[]).filter(f=>!f.readOnly&&moduleFieldVisible(f,value)).every(f=>{
  const child=value[f.name];return child===undefined||child===null||child===''||f.type==='object'&&moduleObjectEmpty(f,child);
 });
}
function moduleFieldValue(f:ModuleField,raw:any,choices:Record<string,ReferenceChoices>,existing:any,path:string):any{
 if(f.reference&&!referenceSelectionValid(f,raw,choices[path],existing))throw Error('Choose an authorized related record for '+f.label+'.');
 if(f.type==='number'){if(raw===undefined||raw===null||raw==='')throw Error('Enter '+f.label+'.');const n=moduleNumericValue(f,raw);if(f.minimum!==undefined&&n<f.minimum||f.maximum!==undefined&&n>f.maximum)throw Error(f.label+' is outside the permitted range.');return n;}
 if(f.type==='boolean'){if(typeof raw!=='boolean')throw Error('Choose Yes or No for '+f.label+'.');return raw;}
 if(f.type==='object'){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Complete '+f.label+'.');return moduleFormBody(f.fields??[],raw,choices,existing??{},path+'.');}
 if(f.type==='array'){if(!Array.isArray(raw)||raw.length<(f.minItems??0)||raw.length>(f.maxItems??100))throw Error('Check the number of entries for '+f.label+'.');return raw.map((v,i)=>moduleFieldValue(f.items!,v,choices,existing?.[i],path+'[].'+f.items!.name));}
 if(f.type==='json')return JSON.parse(typeof raw==='string'?raw:JSON.stringify(raw??[]));
 const value=raw??'';if(typeof value!=='string'||f.required&&!value.length||f.maxLength!==undefined&&value.length>f.maxLength||f.enum&&!f.enum.includes(value))throw Error('Check '+f.label+'.');
 if(f.format==='date'&&!/^\d{4}-\d\d-\d\d$/.test(value))throw Error('Choose a date for '+f.label+'.');
 if(f.format==='date-time')return moduleDateTimeValue(value,f.label);return value;
}

/** Send only query parameters declared by the verified module operation. */
export function moduleListQuery(operation:ApiContribution,input:{offset:number;q?:string;status?:string;from?:string;to?:string}):string{
 const params=new URLSearchParams(),allowed=operation.query??[];
 if(allowed.includes('limit'))params.set('limit','20');if(allowed.includes('offset'))params.set('offset',String(input.offset));
 for(const key of ['q','status'] as const)if(allowed.includes(key)&&input[key])params.set(key,input[key]!);
 for(const key of ['from','to'] as const)if(allowed.includes(key)&&input[key]){const date=new Date(input[key]!);if(!Number.isFinite(date.getTime()))throw Error('Choose a valid reporting date.');params.set(key,date.toISOString());}
 return params.size?'?'+params.toString():'';
}

const zonedDateTime=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i;
const localDateTime=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?$/;
function localTimestamp(date:Date):string{
 const pad=(v:number,n=2)=>String(v).padStart(n,'0');
 return pad(date.getFullYear(),4)+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds())+'.'+pad(date.getMilliseconds(),3);
}
/** Zoned persisted values are displayed locally. In-progress local input is never reparsed or shifted. */
export function moduleDateTimeDisplay(value:unknown):string{
 if(typeof value!=='string')return '';if(!zonedDateTime.test(value))return value;
 const date=new Date(value);return Number.isFinite(date.getTime())?localTimestamp(date):'';
}
/** Keep an unchanged persisted instant, and reject a local time normalized across a DST gap. */
export function moduleDateTimeValue(value:string,label='Date and time'):string{
 if(!zonedDateTime.test(value)&&!localDateTime.test(value))throw Error('Choose a date and time for '+label+'.');
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Choose a valid date and time for '+label+'.');
 if(localDateTime.test(value)){
  const normalized=value.length===16?value+':00.000':value.includes('.')?value.padEnd(23,'0'):value+'.000';
  if(localTimestamp(date)!==normalized)throw Error(label+' does not exist in the local timezone. Choose another time.');
 }
 return date.toISOString();
}
