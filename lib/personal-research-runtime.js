import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {inWindow} from './research-window.js';
import {planPersonalResearch,validatePersonalSources} from './personal-research-plan.js';
import {createRequestBudget,runSourceAdapter} from './personal-research-adapters.js';
import {soundCloudTokenForRun} from './research-runtime.js';

const registry=validatePersonalSources(JSON.parse(readFileSync(new URL('../research/personal-sources.json',import.meta.url),'utf8')));
const check=result=>{if(result.error)throw Error(result.error.message||'Research storage failed');return result.data;};
const distinct=values=>[...new Set(values)];

// A match across outlets is corroboration only when a release claim has a day-precision date.
export function mergePersonalCandidates(rows){
  const byIdentity=new Map();
  for(const row of rows){
    if(!row?.identityKey||!row?.id||!Array.isArray(row.evidence))continue;
    const prior=byIdentity.get(row.identityKey);
    if(!prior){byIdentity.set(row.identityKey,structuredClone(row));continue;}
    prior.evidence.push(...row.evidence.filter(e=>!prior.evidence.some(p=>p.sourceId===e.sourceId&&p.url===e.url)));
    prior.destinations.push(...row.destinations.filter(d=>!prior.destinations.some(p=>p.url===d.url)));
    prior.sourceIds=distinct([...(prior.sourceIds||[]),...(row.sourceIds||[]),...row.evidence.map(e=>e.sourceId)]);
    if(row.dateBasis==='confirmed-release'&&row.datePrecision==='day'){
      if(prior.releaseDate&&prior.releaseDate!==row.releaseDate){prior.dateConflict=true;continue;}
      prior.releaseDate=row.releaseDate;prior.dateBasis='confirmed-release';prior.datePrecision='day';prior.label ||= row.label;
      prior.release ||= row.release;
    }
  }
  return [...byIdentity.values()];
}
export function eligibleResearchCandidate(candidate,window){
  return !candidate.dateConflict&&candidate.dateBasis==='confirmed-release'&&candidate.datePrecision==='day'&&
    inWindow(candidate.releaseDate,window)&&candidate.destinations?.some(d=>['buy','listen'].includes(d.kind));
}
export function researchTrack(candidate){
  const links=candidate.destinations.filter(d=>['buy','listen'].includes(d.kind))
    .map(d=>({kind:d.kind==='buy'?'store-listening':'listen',url:d.url}));
  return {id:candidate.id,artistName:candidate.artistName,title:candidate.title,release:candidate.release||null,
    label:candidate.label||null,releaseDate:candidate.releaseDate,lane:3,score:55,preview:null,links,
    reason:'Verified day-precision release listing; audio characteristics have not been assessed.',
    provenance:{basis:'fresh-research',sources:distinct(candidate.evidence.map(e=>e.sourceId))}};
}
export async function finishPersonalResearch(client,runId,counts){
  if(!runId)return;
  check(await client.from('dp_research_runs').update({fresh_selected:counts.fresh,fallback_selected:counts.fallback})
    .eq('id',runId));
}
export async function researchPersonalJob(client,job,{now=new Date(),fetcher=fetch,sources=registry.sources,
  braveKey=process.env.BRAVE_SEARCH_API_KEY,soundcloudToken,throttleMs=1100}={}){
  const plan=planPersonalResearch(job.profile_snapshot,new Date(job.scheduled_at));
  const runId=randomUUID();
  const existing=check(await client.from('dp_research_runs').select('id').eq('drop_id',job.id).maybeSingle());
  const id=existing?.id||runId;
  check(await client.from('dp_research_runs').upsert({id,user_id:job.user_id,drop_id:job.id,status:'running',
    window_from:plan.window.from,window_to:plan.window.to,started_at:now.toISOString(),finished_at:null},{onConflict:'drop_id'}));
  const budget=createRequestBudget({fetcher,maxRequests:plan.maxRequests,deadlineMs:plan.deadlineMs});
  const coverage=[],all=[];
  if(soundcloudToken===undefined&&sources.some(s=>s.enabled&&s.kind==='soundcloud-tracks')){
    try{soundcloudToken=await soundCloudTokenForRun(fetcher);}catch{soundcloudToken=null;}
  }
  for(const source of sources){
    const outcome=await runSourceAdapter(source,{plan,budget,now,soundcloudToken,braveKey,throttleMs});
    all.push(...outcome.candidates);
    const successful=outcome.coverage.some(p=>p.pages>0&&p.state!=='error');
    const status=!source.enabled?'disabled':successful?'ready':'access-blocked';
    coverage.push({sourceId:source.id,status,state:outcome.state,requests:outcome.requests,
      pages:outcome.coverage.reduce((n,p)=>n+p.pages,0),candidates:outcome.candidates.length});
    const previous=check(await client.from('dp_research_source_health').select('last_success_at').eq('source_id',source.id).maybeSingle());
    check(await client.from('dp_research_source_health').upsert({source_id:source.id,status,
      last_attempt_at:source.enabled?now.toISOString():null,last_success_at:successful?now.toISOString():previous?.last_success_at||null,
      last_state:outcome.state,last_count:outcome.candidates.length},{onConflict:'source_id'}));
    for(const part of outcome.coverage){
      check(await client.from('dp_research_cursors').upsert({run_id:id,source_id:source.id,query_hash:part.queryHash,
        cursor_value:part.cursor,state:part.state==='error'?'error':part.state==='truncated'?'truncated':'complete',pages:part.pages},
      {onConflict:'run_id,source_id,query_hash'}));
    }
  }
  const merged=mergePersonalCandidates(all).slice(0,80),tracks=[];
  const candidateRows=[],observationRows=[],joinRows=[];
  for(const candidate of merged){
    const eligible=eligibleResearchCandidate(candidate,plan.window);
    candidateRows.push({id:candidate.id,identity_key:candidate.identityKey,
      artist_name:candidate.artistName,title:candidate.title,release_date:candidate.releaseDate||null,
      date_precision:candidate.datePrecision||'unknown',date_basis:candidate.dateBasis,
      label:candidate.label||null,facts:{release:candidate.release||null,dateConflict:!!candidate.dateConflict},last_seen_at:now.toISOString()});
    for(const evidence of candidate.evidence){
      observationRows.push({candidate_id:candidate.id,source_id:evidence.sourceId,
        source_url:evidence.url,observed_at:now.toISOString(),claim_type:evidence.claimType||'lead',
        claim_date:evidence.claimDate||null,claim_precision:evidence.claimPrecision||'unknown',facts:{fields:evidence.fields}});
    }
    joinRows.push({run_id:id,candidate_id:candidate.id,eligible});
    if(eligible)tracks.push(researchTrack(candidate));
  }
  if(candidateRows.length){
    check(await client.from('dp_research_candidates').upsert(candidateRows,{onConflict:'id'}));
    check(await client.from('dp_research_observations').upsert(observationRows,{onConflict:'candidate_id,source_id,source_url'}));
    check(await client.from('dp_research_run_candidates').upsert(joinRows,{onConflict:'run_id,candidate_id'}));
  }
  const usable=coverage.filter(s=>s.status==='ready').length;
  check(await client.from('dp_research_runs').update({status:usable?'complete':coverage.some(s=>s.requests)?'partial':'access-blocked',
    request_count:budget.count,candidate_count:merged.length,eligible_count:tracks.length,coverage,finished_at:now.toISOString()}).eq('id',id));
  return {runId:id,tracks,coverage,requestCount:budget.count,eligibleCount:tracks.length};
}
