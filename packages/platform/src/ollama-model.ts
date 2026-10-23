import { randomUUID } from 'node:crypto';
import type { ModelTurn } from './analyst-model.js';

export const narrativeOutputSchema={type:'object',properties:{narrative:{type:'string'},assumptions:{type:'array',items:{type:'string'}},humanDecisions:{type:'array',items:{type:'string'},minItems:1}},required:['narrative','assumptions','humanDecisions'],additionalProperties:false};

// Normalize the provider-independent investigation history into Ollama's native
// chat wire format. Business text/results remain unchanged and untrusted.
export function ollamaMessages(input:any[],instructions:string){
  const messages:any[]=[{role:'system',content:instructions}],names=new Map<string,string>();
  for(const item of input){
    if(item.type==='function_call'){
      names.set(item.call_id,item.name);const call={function:{name:item.name,arguments:JSON.parse(item.arguments)}};
      const previous=messages.at(-1);if(previous.role==='assistant'&&previous.tool_calls)previous.tool_calls.push(call);else messages.push({role:'assistant',content:'',tool_calls:[call]});
    }else if(item.type==='function_call_output'){
      const name=names.get(item.call_id);if(!name)throw new Error('MODEL_CONTEXT_INVALID');messages.push({role:'tool',tool_name:name,content:item.output});
    }else if(item.role==='user'&&typeof item.content==='string')messages.push({role:'user',content:item.content});
    else if(item.type==='message'&&item.role==='assistant')messages.push({role:'assistant',content:item.content.filter((v:any)=>v.type==='output_text').map((v:any)=>v.text).join('')});
    else throw new Error('MODEL_CONTEXT_INVALID');
  }return messages;
}
export function ollamaTurn(value:any):ModelTurn{
  if(value.done!==true||value.done_reason==='length'||!value.message||typeof value.message.content!=='string'||!Array.isArray(value.message.tool_calls??[]))throw new Error('MODEL_OUTPUT_INVALID');
  const raw=value.message.tool_calls??[];if(raw.length>8)throw new Error('MODEL_OUTPUT_INVALID');
  const calls=raw.map((v:any)=>{const f=v.function;if(!f||typeof f.name!=='string'||f.name.length>100||!f.arguments||typeof f.arguments!=='object'||Array.isArray(f.arguments))throw new Error('MODEL_OUTPUT_INVALID');const args=JSON.stringify(f.arguments);if(args.length>12000)throw new Error('MODEL_OUTPUT_INVALID');return {call_id:'ollama_'+randomUUID(),name:f.name,arguments:args};});
  return {calls,text:value.message.content,output:calls.length?calls.map((c:any)=>({type:'function_call',...c})):[{type:'message',role:'assistant',content:[{type:'output_text',text:value.message.content}]}]};
}
