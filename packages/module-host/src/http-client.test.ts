import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type RequestListener} from 'node:http';
import {moduleHttp} from './http-client.js';

async function fixture(listener:RequestListener,run:(port:number)=>Promise<void>){
 const server=createServer(listener);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const address=server.address();assert(address&&typeof address==='object');await run(address.port);}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
test('native module transport preserves bounded JSON responses and exact configuration evidence',async()=>{
 await fixture((_req,res)=>{res.writeHead(200,{'content-type':'application/json','x-steward-provider-configuration-digest':'a'.repeat(64)});res.end('{"ok":true}');},async port=>{
  assert.deepEqual(await moduleHttp({host:'127.0.0.1',port,path:'/',method:'GET',timeout:1000}),{status:200,value:{ok:true},providerConfigurationDigest:'a'.repeat(64)});
 });
});
test('continuous response activity cannot extend the absolute module-call deadline',async()=>{
 await fixture((req,res)=>{
  res.writeHead(200,{'content-type':'application/json'});res.write('{"ok":');
  const interval=setInterval(()=>res.write(' '),5),finish=setTimeout(()=>res.end('true}'),2000);
  req.on('close',()=>{clearInterval(interval);clearTimeout(finish);});
 },async port=>{
  const started=performance.now();await assert.rejects(()=>moduleHttp({host:'127.0.0.1',port,path:'/',method:'GET',timeout:80}));
  assert(performance.now()-started<1000,'Absolute timeout was extended by response activity');
 });
});
test('malformed and oversized provider responses fail instead of producing a successful result',async()=>{
 await fixture((req,res)=>{res.writeHead(200);res.end(req.url==='/large'?'x'.repeat(1048577):'{malformed');},async port=>{
  await assert.rejects(()=>moduleHttp({host:'127.0.0.1',port,path:'/invalid',method:'GET',timeout:1000}),/Invalid runtime response/);
  await assert.rejects(()=>moduleHttp({host:'127.0.0.1',port,path:'/large',method:'GET',timeout:1000}),/Response exceeds limit/);
 });
});
