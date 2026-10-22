import { Resolver } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';

// getaddrinfo uses libuv's shared worker pool. Repeated DNS failures for a
// disconnected remote peer must not starve local PostgreSQL connection DNS.
const resolver = new Resolver({ timeout: 1000, tries: 1 });
const hosts=new Map<string,{address:string;family:number}[]>();
try {
  const file=process.platform==='win32'?`${process.env.SystemRoot??'C:/Windows'}/System32/drivers/etc/hosts`:'/etc/hosts';
  for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
    const [address,...names]=line.split('#')[0]!.trim().split(/\s+/);const family=isIP(address??'');if(!family)continue;
    for(const name of names){const entries=hosts.get(name.toLowerCase())??[];entries.push({address:address!,family});hosts.set(name.toLowerCase(),entries);}
  }
}catch{ /* DNS remains available where no hosts file exists. */ }
export function boundedLookup(hostname:string,options:any,callback:any):void {
  const complete=(addresses:{address:string;family:number}[])=>{
    const matches=addresses.filter(a=>!options?.family||a.family===options.family);
    if(!matches.length)return callback(Object.assign(new Error('DNS address unavailable'),{code:'ENOTFOUND'}));
    if(options?.all)callback(null,matches);else callback(null,matches[0]!.address,matches[0]!.family);
  };
  const literal=isIP(hostname);if(literal){queueMicrotask(()=>complete([{address:hostname,family:literal}]));return;}
  const local=hosts.get(hostname.toLowerCase());if(local){queueMicrotask(()=>complete(local));return;}
  void Promise.allSettled([resolver.resolve4(hostname),resolver.resolve6(hostname)]).then(results=>{
    const addresses=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.map(address=>({address,family:i===0?4:6})):[]);complete(addresses);
  },()=>callback(Object.assign(new Error('DNS resolution unavailable'),{code:'ENOTFOUND'})));
}
