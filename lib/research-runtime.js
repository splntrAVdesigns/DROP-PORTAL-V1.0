import {gh,readState} from './repository.js';
import {validateRegistry,discoverSource,mergeQueue,MAX_CANDIDATES} from './research.js';
import {captureOccurrence} from './pipeline.js';
import {resolveSearchWindow} from './research-window.js';
import {rankCandidates} from './research-ranking.js';

const REGISTRY='research/sources.json',QUEUE='research/queue.json';
export async function soundCloudTokenForRun(fetcher=fetch){
  if(process.env.SOUNDCLOUD_ACCESS_TOKEN)return process.env.SOUNDCLOUD_ACCESS_TOKEN;
  const client=process.env.SOUNDCLOUD_CLIENT_ID,secret=process.env.SOUNDCLOUD_CLIENT_SECRET;
  if(!client||!secret)return null;
  const response=await fetcher('https://secure.soundcloud.com/oauth/token',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{Authorization:'Basic '+Buffer.from(client+':'+secret).toString('base64'),
      'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body:'grant_type=client_credentials'
  });
  if(!response.ok)throw Error('SoundCloud credential exchange HTTP '+response.status);
  const data=await response.json();
  if(typeof data.access_token!=='string'||!data.access_token)throw Error('SoundCloud returned no access token');
  return data.access_token;
}
async function readJson(path,revision){
  const file=await gh(`contents/${path}?ref=${encodeURIComponent(revision)}`);
  return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
}
export async function researchSnapshot({withArchive=false}={}){
  const state=await readState();
  const [registry,queue]=await Promise.all([readJson(REGISTRY,state.revision),readJson(QUEUE,state.revision)]);
  validateRegistry(registry);
  if(queue?.schemaVersion!==1||!Array.isArray(queue.candidates)||!Array.isArray(queue.runs))throw Error('Invalid research queue');
  let archive=[];
  if(withArchive){
    const index=await readJson('weekly-feed/drops/index.json',state.revision);
    if(index?.schemaVersion!==1||!Array.isArray(index.drops))throw Error('Invalid published drop index');
    const entries=index.drops.filter(d=>d.status==='published').slice(0,8);
    for(const entry of entries)if(!/^\.\/[a-zA-Z0-9._-]+\.json$/.test(entry.url))throw Error('Invalid archived drop path');
    archive=await Promise.all(entries.map(e=>readJson('weekly-feed/drops/'+e.url.slice(2),state.revision)));
  }
  return {...state,registry,queue,archive};
}
export async function writeQueue(revision,queue){
  const commit=await gh('git/commits/'+revision);
  const tree=await gh('git/trees',{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree:[{
    path:QUEUE,mode:'100644',type:'blob',content:JSON.stringify(queue,null,2)+'\n'
  }]})});
  const next=await gh('git/commits',{method:'POST',body:JSON.stringify({
    message:'Phase 3A: ingest verified-source research candidates',tree:tree.sha,parents:[revision]
  })});
  await gh('git/refs/heads/main',{method:'PATCH',body:JSON.stringify({sha:next.sha,force:false})});
  const readback=await readJson(QUEUE,next.sha);
  if(JSON.stringify(readback)!==JSON.stringify(queue))throw Error('Research queue writeback mismatch');
  return next.sha;
}
export async function reviewResearchCandidate(id,decision){
  if(typeof id!=='string'||!/^research-[a-f0-9]{24}$/.test(id)||!['shortlisted','rejected','needs_review'].includes(decision))
    throw Object.assign(new Error('Invalid research review decision'),{status:400});
  const snapshot=await researchSnapshot();
  const candidate=snapshot.queue.candidates.find(c=>c.id===id);
  if(!candidate)throw Object.assign(new Error('Research candidate not found'),{status:404});
  if(candidate.reviewStatus===decision)return {ok:true,id,reviewStatus:decision,idempotent:true};
  const next=structuredClone(snapshot.queue);
  next.candidates.find(c=>c.id===id).reviewStatus=decision;
  next.updatedAt=new Date().toISOString();
  try{
    const commitSha=await writeQueue(snapshot.revision,next);
    return {ok:true,id,reviewStatus:decision,commitSha};
  }catch(error){
    if(error.status===409)throw Object.assign(new Error('Research queue changed; reload and retry your review.'),{status:409});
    throw error;
  }
}
export async function runResearch({dryRun=false,now=new Date(),fetcher=fetch,soundcloudToken,throttleMs=1100}={}){
  const snapshot=await researchSnapshot({withArchive:true});
  const {registry,queue}=snapshot;
  const captured=captureOccurrence(snapshot.schedule,snapshot.inquiry);
  const window=resolveSearchWindow(captured.profile.searchPast,now);
  const outcomes=[],candidates=[];
  if(soundcloudToken===undefined&&registry.sources.some(s=>s.enabled&&s.kind==='soundcloud-tracks')){
    try{soundcloudToken=await soundCloudTokenForRun(fetcher);}
    catch(error){soundcloudToken=null;outcomes.push({sourceId:'soundcloud-auth',state:'error',count:0,message:error.message});}
  }
  for(const source of registry.sources.filter(s=>s.enabled)){
    try{
      const result=await discoverSource(source,{fetcher,now,window,soundcloudToken,throttleMs});
      candidates.push(...result.candidates);
      outcomes.push({sourceId:source.id,state:result.state,count:result.candidates.length,coverage:result.coverage});
    }catch(error){
      outcomes.push({sourceId:source.id,state:'error',count:0,message:String(error.message).slice(0,160)});
    }
  }
  const merged=mergeQueue(queue,candidates,now);
  const report={at:now.toISOString(),added:merged.added,matched:merged.matched,sources:outcomes};
  report.window=window;
  report.profileSnapshot=captured.profile;
  report.captured={nextDropAt:captured.nextDropAt,inquiryUpdatedAt:captured.inquiryUpdatedAt};
  const ranked=rankCandidates(merged.queue.candidates,{profile:captured.profile,window,archive:snapshot.archive});
  report.capacityDropped=Math.max(0,ranked.length-MAX_CANDIDATES);
  const preserved=ranked.filter(c=>c.reviewStatus==='shortlisted');
  const remaining=ranked.filter(c=>c.reviewStatus!=='shortlisted');
  const next={...merged.queue,candidates:[...preserved,...remaining].slice(0,MAX_CANDIDATES),runs:[report,...queue.runs].slice(0,30)};
  report.eligible=next.candidates.filter(c=>c.ranking.eligible&&!c.ranking.repeated&&c.reviewStatus!=='rejected').length;
  if(dryRun)return {...report,status:'dry_run',totalCandidates:next.candidates.length};
  const commitSha=await writeQueue(snapshot.revision,next);
  return {...report,status:'saved',totalCandidates:next.candidates.length,commitSha};
}
