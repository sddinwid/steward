import {useEffect,useState} from 'react';
type Api=<T=any>(path:string,method?:string,body?:unknown)=>Promise<T>;
function download(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function publicFile(file:File|undefined){if(!file)throw new Error('Choose a public configuration file');if(file.size>1048576)throw new Error('Public configuration file exceeds 1 MiB');const text=await file.text();if(/PRIVATE KEY/i.test(text))throw new Error('Private keys must never be uploaded');return JSON.parse(text);}
/** Operator governance only. Ordinary service staff use module-contributed
 * forms; this panel never renders participant records or command payloads. */
export function PeerServices({api}:{api:Api}){
 const [data,setData]=useState<any>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false);
 const [profile,setProfile]=useState<File>(),[pins,setPins]=useState<File>(),[grant,setGrant]=useState<File>();
 const refresh=async()=>setData(await api('/v13/peer-services'));
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
 async function act(work:()=>Promise<unknown>){setBusy(true);setError('');try{await work();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section aria-label="Approved service partners"><div className="section-heading"><h3>Approved service partners</h3><button disabled={busy} onClick={()=>void act(refresh)}>Refresh partner status</button></div>
  <p>Cross-Worker services require enrolled identities, independent TLS and package trust pins, programme authority on both Workers, and an approved Smart Module workflow. A partner snapshot describes reviewed packages; it does not assert current availability.</p>
  {error?<p role="alert">{error}</p>:null}
  <button disabled={busy} onClick={()=>void act(async()=>{const p=await api('/v13/peer-services/profile');download(p.profile,'steward-public-peer-profile.json');})}>Export this Worker’s public profile</button>
  <details><summary>Import an independently verified partner</summary>
   <p>Obtain the partner’s public identity, issuer CA and publisher fingerprints through your operator’s trusted channel. Create a separate public pins file from those verified values. A profile expires five minutes after export. Never upload credentials or a private key.</p>
   <label>Signed public partner profile<input type="file" accept="application/json,.json" onChange={e=>{setProfile(e.target.files?.[0]);setReviewed(false);}}/></label>
   <label>Independently verified public pins<input type="file" accept="application/json,.json" onChange={e=>{setPins(e.target.files?.[0]);setReviewed(false);}}/></label>
   <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I verified the Worker identity, HTTPS origin, CA and publisher fingerprints independently.</label>
   <button disabled={busy||!profile||!pins||!reviewed} onClick={()=>void act(async()=>{await api('/v13/peer-services/peers','POST',{profile:await publicFile(profile),pins:await publicFile(pins)});setReviewed(false);})}>Approve partner profile</button>
  </details>
  <details><summary>Review a programme service grant</summary><p>Exchange public grant files with the other programme administrator. Source approval, destination approval and final source import are separate operations. The server checks current module-owned programme authority, signed contracts, purpose, expiry and exact package identities.</p>
   <label>Public grant proposal or signed approvals<input type="file" accept="application/json,.json" onChange={e=>setGrant(e.target.files?.[0])}/></label>
   <div className="actions">{(['propose','countersign','approve'] as const).map(stage=><button key={stage} disabled={busy||!grant} onClick={()=>void act(async()=>{const value=await api('/v13/peer-services/grants/'+stage,'POST',await publicFile(grant));if(stage!=='approve')download(value,'steward-service-grant-'+stage+'.json');})}>{stage==='propose'?'Sign source proposal':stage==='countersign'?'Approve destination':'Import completed grant'}</button>)}</div>
  </details>
  {data?<><h4>Partner identities</h4>{data.peers.length?data.peers.map((p:any)=><div className="request-card" key={p.installation_id}><strong>{p.installation_id}</strong><p>Entity {p.entity_id} · {p.state}</p>{p.state==='approved'?<button disabled={busy} onClick={()=>void act(()=>api('/v13/peer-services/peers/'+p.installation_id+'/revoke','POST',{}))}>Revoke partner</button>:null}</div>):<p>No partner has been approved.</p>}
   <h4>Programme service approvals</h4>{data.grants.length?data.grants.map((g:any)=><div className="request-card" key={g.grant_id}><strong>{g.grant_id}</strong><p>{g.local_side} approval · {g.state}</p>{g.state==='approved'?<button disabled={busy} onClick={()=>void act(()=>api('/v13/peer-services/grants/'+g.grant_id+'/revoke','POST',{}))}>Revoke service grant</button>:null}</div>):<p>No bilateral service grants.</p>}
   <h4>Private service delivery status</h4>{data.deliveries.length?data.deliveries.map((d:any)=><p key={d.command_id}>{d.command_id} · {d.state} · {d.attempts} attempts · {d.error_code??'No reported failure'}</p>):<p>No cross-Worker deliveries.</p>}
  </>:null}
 </section>;
}
