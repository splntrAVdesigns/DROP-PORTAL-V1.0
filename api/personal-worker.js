import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {gh} from '../lib/repository.js';
import {nextPersonalOccurrence,curatePersonalDrop} from '../lib/personal-discovery.js';

const reply=(res,status,data)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json(data);};
const fail=error=>{throw Error(error?.message||'Personal worker storage error');};
const readJson=async(path)=>{
  const file=await gh('contents/'+path+'?ref=main');
  return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
};
const dropPath=url=>/^\.\/[\w.-]+\.json$/.test(url||'')?'weekly-feed/drops/'+url.slice(2):null;
const officialPreview=preview=>{
  if(preview?.kind!=='provider-embed'||typeof preview.embedUrl!=='string')return false;
  try{
    const url=new URL(preview.embedUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
    return url.hostname==='bandcamp.com'&&url.pathname.startsWith('/EmbeddedPlayer/')||
      url.hostname==='w.soundcloud.com'&&url.pathname.startsWith('/player/')||
      url.hostname==='www.mixcloud.com'&&url.pathname.startsWith('/widget/');
  }catch{return false;}
};
export function withVerifiedPreviews(payload,amendment,entry){
  if(!payload||!Array.isArray(payload.tracks)||!amendment||amendment.schemaVersion!==1||
    amendment.dropId!==entry.id||amendment.sourcePayload!==entry.url||!Array.isArray(amendment.tracks))return payload;
  const ids=new Set(payload.tracks.map(t=>t.id)),seen=new Set(),previews=new Map();
  for(const row of amendment.tracks){
    if(!ids.has(row?.id)||seen.has(row.id))return payload;
    seen.add(row.id);
    if(officialPreview(row.preview))previews.set(row.id,row.preview);
  }
  return {...payload,tracks:payload.tracks.map(t=>({...t,preview:t.preview||previews.get(t.id)||null}))};
}
async function catalog(){
  const index=await readJson('weekly-feed/drops/index.json');
  const entries=index.drops.filter(e=>e.status==='published'&&!e.id.startsWith('TEST-')&&dropPath(e.url)).slice(0,12);
  return Promise.all(entries.map(async e=>{
    const payload=await readJson(dropPath(e.url));
    if(!dropPath(e.enrichmentUrl))return payload;
    try{return withVerifiedPreviews(payload,await readJson(dropPath(e.enrichmentUrl)),e);}
    catch{return payload;}
  }));
}
export async function runPersonalWorker(client,{now=new Date(),catalogLoader=catalog,limit=20}={}){
  const due=now.toISOString(),summary={queued:0,ready:0,needsResearch:0,recovered:0,failed:0,errors:[]};
  const staleBefore=new Date(+now-5*60000).toISOString();
  const stalled=await client.from('dp_personal_drops').select('id,attempts,updated_at').eq('status','running').lt('updated_at',staleBefore).limit(limit);if(stalled.error)fail(stalled.error);
  for(const job of stalled.data){
    const recovered=await client.from('dp_personal_drops').update({status:job.attempts>=3?'failed':'queued',
      status_detail:job.attempts>=3?'Processing interrupted three times. Please contact support.':'Interrupted processing recovered; retrying.',updated_at:due})
      .eq('id',job.id).eq('status','running').eq('attempts',job.attempts).eq('updated_at',job.updated_at).select('id');
    if(recovered.error)fail(recovered.error);summary.recovered+=recovered.data.length;if(job.attempts>=3)summary.failed+=recovered.data.length;
  }
  const schedules=await client.from('dp_personal_plans').select('*').lte('next_drop_at',due).order('next_drop_at').limit(limit);if(schedules.error)fail(schedules.error);
  for(const plan of schedules.data){
    try{
      const next=nextPersonalOccurrence(plan.weekday,String(plan.local_time).slice(0,5),now);
      const queued=await client.rpc('dp_queue_due_weekly',{p_user:plan.user_id,p_revision:plan.revision,
        p_at:plan.next_drop_at,p_next:next.toISOString()});if(queued.error)fail(queued.error);
      if(queued.data)summary.queued++;
    }catch(e){summary.errors.push('Weekly queue transaction failed.');}
  }
  const jobs=await client.from('dp_personal_drops').select('*').eq('status','queued').lte('scheduled_at',due).order('scheduled_at').limit(limit);if(jobs.error)fail(jobs.error);
  let releases=null;
  for(const job of jobs.data){
    try{
      const claim=await client.from('dp_personal_drops').update({status:'running',attempts:job.attempts+1,updated_at:due}).eq('id',job.id).eq('status','queued').eq('attempts',job.attempts).select('id');
      if(claim.error)fail(claim.error);if(!claim.data?.length)continue;
      releases??=await catalogLoader();
      const f=await client.from('dp_feedback').select('track_id,kind,value').eq('user_id',job.user_id);if(f.error)fail(f.error);
      const selection=curatePersonalDrop(releases,job.profile_snapshot,f.data,new Date(job.scheduled_at));
      const saved=await client.from('dp_personal_drops').update({status:selection.status,result:selection.result||null,status_detail:selection.detail||null,updated_at:new Date().toISOString()})
        .eq('id',job.id).eq('status','running').eq('attempts',job.attempts+1).select('id');if(saved.error)fail(saved.error);
      if(saved.data.length){if(selection.status==='ready')summary.ready++;else summary.needsResearch++;}
    }catch(e){
      summary.errors.push('Drop processing failed.');
      if(job.attempts>=2)summary.failed++;
      const recovery=await client.from('dp_personal_drops').update({status:job.attempts>=2?'failed':'queued',
        status_detail:job.attempts>=2?'Research source unavailable after three attempts.':'Research source temporarily unavailable; retrying.',
        updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','running').eq('attempts',job.attempts+1);
      if(recovery.error)summary.errors.push('Drop recovery failed.');
    }
  }
  return summary;
}
export default async function handler(req,res){
  if(req.method!=='POST')return reply(res,405,{message:'Method not allowed.'});
  const secret=process.env.DROP_PORTAL_WORKER_SECRET;
  const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!req.headers.authorization?.startsWith('Bearer ')||!secret||secret.length<32||Buffer.byteLength(secret)!==Buffer.byteLength(supplied)||
    !timingSafeEqual(Buffer.from(secret),Buffer.from(supplied)))return reply(res,401,{message:'Worker authorization required.'});
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.SUPABASE_URL)return reply(res,503,{message:'Private worker storage is not configured.'});
  try{
    const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
      {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})}});
    const runId=randomUUID();
    const started=await client.rpc('dp_start_worker_run',{p_id:runId});if(started.error)fail(started.error);
    let summary;
    try{summary=await runPersonalWorker(client);}catch(error){
      await client.from('dp_worker_runs').update({finished_at:new Date().toISOString(),outcome:'failed'}).eq('id',runId);throw error;
    }
    const finished=await client.from('dp_worker_runs').update({finished_at:new Date().toISOString(),outcome:summary.errors.length?'failed':'success'}).eq('id',runId);if(finished.error)fail(finished.error);
    return reply(res,summary.errors.length?503:200,summary);
  }catch(e){return reply(res,503,{message:'Private worker failed; queued requests remain visible.'});}
}
