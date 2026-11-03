import type {MarketingSnapshot} from '@steward/module-sdk/marketing';
export function snapshotPresentation(s:MarketingSnapshot, publication: 'Local only'|'Published to Master'|'Withdrawn', current:boolean, now=Date.now()) {
 const empty=s.rows.length===0, stale=Date.parse(s.expiresAt)<=now;
 const total=s.rows.reduce((n,r)=>n+r.count,0), safe=Number.isSafeInteger(total);
 const labels:Record<string,string>={view_item:'product views',add_to_cart:'add-to-cart events',begin_checkout:'checkout starts',purchase:'purchase events'};
 const contents=empty?'No reporting data returned':s.kind==='traffic'?(safe?total.toLocaleString('en-US')+' reported sessions':'Session total unavailable')+' across '+new Set(s.rows.map(r=>r.dimension)).size+' channels':Object.entries(labels).filter(([key])=>s.rows.some(r=>r.dimension===key)).map(([key,label])=>{const n=s.rows.filter(r=>r.dimension===key).reduce((n,r)=>n+r.count,0);return (Number.isSafeInteger(n)?n.toLocaleString('en-US'):'Unknown')+' '+label;}).join('; ');
 const concerns=[...(!current?['Previous property/store association']:[]),...(stale?['Outdated for current comparison']:[]),...(!s.complete||s.qualifications.length?['Qualified data: '+(s.qualifications.join(', ')||'incomplete coverage')]:[])];
 const guidance=empty?'Useful for setup diagnosis, not performance conclusions. Check tracking, consent, dates and Google processing time; this does not prove zero visitors.':s.kind==='traffic'?'Open the evidence to inspect daily traffic channels. This does not establish which campaign caused sales.':'Open the evidence to inspect recorded shopping activity. Event counts are not unique shoppers or a conversion funnel; absent events remain unknown.';
 return {reportTitle:s.kind==='traffic'?'Traffic by channel':'Shopping activity',period:s.from+' to '+s.to,contents,usefulness:concerns.length?concerns.join(' · '):empty?'Empty report — setup review':'Available for evidence review',guidance,sharing:publication,retrievedAt:s.retrievedAt};
}
