import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { tlsFetch } from '../packages/platform/dist/analyst-model.js';
import { directory } from './lib.mjs';
import { origin, sessions } from './phase4-client.mjs';
export async function mcp(key,session=sessions[key],extra={}){
 const url=new URL(origin(key)+'/api/v5/mcp');const ca=await readFile(path.join(directory,'security/ca-cert.pem'));
 const network=tlsFetch(ca,url.hostname,10000);
 const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{cookie:session?.cookie??'',origin:origin(key),'x-csrf-token':session?.csrfToken??'','x-steward-client':'steward-mcp-cli-v1',host:url.hostname,...extra}},fetch:(input,init)=>{const target=new URL(String(input));target.hostname='127.0.0.1';return network(target,init);}});
 const client=new Client({name:'steward-mcp-cli-v1',version:'1.0.0'});
 try{await client.connect(transport,{timeout:10000});return client;}catch{await client.close().catch(()=>{});throw new Error('MCP_CONNECTION_REJECTED');}
}
