import {candidateIdentity,releaseInterval} from './music-identity.js';

const check=r=>{if(r.error)throw Error(r.error.message||'Retrieval storage failed');return r.data;};
export async function retrievalReadiness(client){
  const r=await client.rpc('dp_research_readiness');
  if(r.error||!['3D.3B','3D.3C'].includes(r.data?.schema)||!r.data.history||!r.data.graph||!r.data.hybrid||r.data.schema==='3D.3C'&&!r.data.resumable_preparation)
    throw Error('Research schema is not ready. Apply migrations 009, 010, then 011 before running the worker.');
  return r.data;
}
export async function expandMusicGraph(client,profile){
  const seeds=[...(profile.artists||[]).map(name=>({kind:'artist',name})),...(profile.labels||[]).map(name=>({kind:'label',name}))].slice(0,20);
  if(!seeds.length)return [];
  return check(await client.rpc('dp_expand_music_graph',{p_seeds:seeds}))||[];
}
export async function persistMusicGraph(client,candidates,now=new Date()){
  const nodes=[],names=[],edges=[];
  const node=(id,kind,name,url)=>nodes.push({id,kind,name,source_url:url,observed_at:now.toISOString()});
  const edge=(from,to,relation,url)=>edges.push({from_id:from,to_id:to,relation,source_url:url,observed_at:now.toISOString(),active:true});
  for(const c of candidates){
    const identity=candidateIdentity(c);if(identity.status!=='resolved'||c.dateConflict)continue;
    node(identity.recordingId,'recording',c.title,identity.sourceUrl);
    for(const artist of identity.artists||[]){
      node(artist.id,'artist',artist.name,'https://musicbrainz.org/artist/'+artist.id.slice(9));
      names.push({node_id:artist.id,name:artist.creditedName,source_url:identity.sourceUrl});
      edge(artist.id,identity.recordingId,'credited_on',identity.sourceUrl);
    }
    for(const edition of identity.editions||[]){
      node(edition.id,'release',edition.title,edition.sourceUrl);
      edge(identity.recordingId,edition.id,'issued_as',identity.sourceUrl);
      for(const label of edition.labels||[]){
        node(label.id,'label',label.name,label.sourceUrl);
        edge(edition.id,label.id,'released_by',edition.sourceUrl);
      }
    }
  }
  const save=async(table,rows,key)=>{
    if(rows.length)check(await client.from(table).upsert([...new Map(rows.map(r=>[key.split(',').map(k=>r[k]).join('\0'),r])).values()],{onConflict:key}));
  };
  await save('dp_graph_nodes',nodes,'id');await save('dp_graph_names',names,'node_id,name');
  await save('dp_graph_edges',edges,'from_id,to_id,relation');
}

export async function embedRetrievalTexts(items,{fetcher=fetch,key=process.env.OPENAI_API_KEY}={}){
  if(!key)throw Error('Embedding credentials missing');
  if(!items.length||items.length>13||items.some(x=>!['musicbrainz-core-cc0','user-query'].includes(x.permissionScope)||
    typeof x.text!=='string'||!x.text.trim()||x.text.length>2000))throw Error('Text is not approved for embedding');
  const response=await fetcher('https://api.openai.com/v1/embeddings',{method:'POST',redirect:'error',signal:AbortSignal.timeout(6000),
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
      model:'text-embedding-3-small',dimensions:256,encoding_format:'float',input:items.map(x=>x.text)})});
  if(!response.ok)throw Error(response.status===429?'Embedding provider rate limited':'Embedding provider unavailable');
  const body=await response.text();if(body.length>500000)throw Error('Embedding response too large');
  const data=JSON.parse(body),vectors=Array(items.length),seen=new Set();
  if(data.model!=='text-embedding-3-small'||!Array.isArray(data.data)||data.data.length!==items.length)throw Error('Invalid embedding response');
  for(const item of data.data){
    if(!Number.isInteger(item.index)||item.index<0||item.index>=items.length||seen.has(item.index)||
      !Array.isArray(item.embedding)||item.embedding.length!==256||item.embedding.some(v=>!Number.isFinite(v))||
      !item.embedding.some(v=>v!==0))throw Error('Invalid embedding vector');
    seen.add(item.index);vectors[item.index]=item.embedding;
  }
  return {vectors,tokens:Number.isSafeInteger(data.usage?.total_tokens)?data.usage.total_tokens:null};
}

export async function warmRetrievalIndex(client,{query=null,fetcher=fetch,key=process.env.OPENAI_API_KEY,
  semanticEnabled=process.env.DROP_PORTAL_SEMANTIC_ENABLED==='true'}={}){
  const refreshed=check(await client.rpc('dp_refresh_retrieval_index',{p_limit:80}));
  const report={refreshed,indexed:0,semanticState:!semanticEnabled?'disabled':!key?'credentials-missing':'pending',tokens:0,requests:0};
  if(!semanticEnabled||!key)return {report,queryVector:null};
  const rows=check(await client.rpc('dp_embedding_batch',{p_limit:12}))||[];
  const items=rows.map(r=>({text:r.semantic_text,permissionScope:r.permission_scope}));
  if(query)items.push({text:query,permissionScope:'user-query'});
  if(!items.length)return {report:{...report,semanticState:'idle'},queryVector:null};
  let result;
  try{report.requests=1;result=await embedRetrievalTexts(items,{fetcher,key});}
  catch(error){report.semanticState=error.message.includes('rate limited')?'rate-limited':'unavailable';return {report,queryVector:null};}
  report.tokens=result.tokens;
  for(let i=0;i<rows.length;i++){
    const saved=check(await client.rpc('dp_save_embedding',{p_candidate:rows[i].candidate_id,p_hash:rows[i].content_hash,p_embedding:JSON.stringify(result.vectors[i])}));
    if(saved)report.indexed++;
  }
  report.semanticState='ready';return {report,queryVector:query?result.vectors.at(-1):null};
}

export async function retrieveMusic(client,plan,graph,options={}){
  const started=Date.now();
  const query=plan.queries.map(q=>q.term).join('; ').slice(0,1200);
  const lexical=plan.queries.map(q=>'"'+q.term.replaceAll('"','')+'"').join(' OR ').slice(0,1200);
  const {report,queryVector}=await warmRetrievalIndex(client,{...options,query});
  const hits=check(await client.rpc('dp_hybrid_retrieve',{p_query:lexical,p_vector:queryVector?JSON.stringify(queryVector):null,
    p_graph:graph.filter(n=>n.kind==='recording').map(n=>n.node_id),p_from:plan.window.from,p_to:plan.window.to}))||[];
  const ids=hits.map(h=>h.candidate_id);
  if(!ids.length)return {candidates:[],report:{...report,hits:0,graphNodes:graph.length,latencyMs:Date.now()-started}};
  const candidates=check(await client.from('dp_research_candidates').select('*').in('id',ids))||[];
  const evidence=check(await client.from('dp_music_evidence').select('*').in('candidate_id',ids))||[];
  const hydrated=candidates.filter(c=>c.identity_status==='resolved'&&!c.facts?.dateConflict).map(c=>{
    const providerId=c.recording_id?.replace(/^mbrecording:/,'');
    const claims=evidence.filter(e=>e.candidate_id===c.id).map(e=>({sourceId:e.source_id,url:e.source_url,
      claimType:e.claim_type,claimDate:e.claim_precision==='day'?e.claim_from:null,claimPrecision:e.claim_precision,
      checkedAt:e.observed_at,recordingId:e.recording_id,verification:e.verification}));
    return {id:c.id,identityKey:c.identity_key,artistName:c.artist_name,title:c.title,label:c.label,
      release:c.facts?.release||null,releaseDate:c.release_date,datePrecision:c.date_precision,dateBasis:c.date_basis,
      dateInterval:c.facts?.dateInterval||releaseInterval(c.release_date),
      identity:{status:'resolved',recordingId:c.recording_id,provider:'musicbrainz',providerId},evidence:claims,
      destinations:claims.filter(e=>e.claimType==='release-page'&&e.verification==='verified').map(e=>({kind:'listen',url:e.url})),
      retrieval:{...hits.find(h=>h.candidate_id===c.id),graphPath:graph.find(n=>n.node_id===c.recording_id)?.path||[]}};
  });
  return {candidates:hydrated,report:{...report,semanticHits:hits.filter(h=>h.semantic_rank).length,lexicalHits:hits.filter(h=>h.lexical_rank).length,graphHits:hits.filter(h=>h.graph_rank).length,hits:hits.length,graphNodes:graph.length,latencyMs:Date.now()-started}};
}
