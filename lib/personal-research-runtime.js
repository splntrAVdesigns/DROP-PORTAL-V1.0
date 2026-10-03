import {retrievalReadiness,expandMusicGraph,persistMusicGraph,retrieveMusic} from './hybrid-retrieval.js';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {inWindow} from './research-window.js';
import {planPersonalResearch,validatePersonalSources} from './personal-research-plan.js';
import {createRequestBudget,runSourceAdapter} from './personal-research-adapters.js';
import {soundCloudTokenForRun} from './research-runtime.js';
import {candidateIdentity,verifiedDestinations,releaseInterval,evidenceId,safeEvidenceUrl} from './music-identity.js';
import {verifyReleaseCandidate,applyReleaseVerification} from './release-verification.js';

const registry=validatePersonalSources(JSON.parse(readFileSync(new URL('../research/personal-sources.json',import.meta.url),'utf8')));
const check=result=>{if(result.error)throw Error(result.error.message||'Research storage failed');return result.data;};
const distinct=values=>[...new Set(values)];

// String similarity cannot corroborate a recording. Unresolved leads remain source-scoped.
export function mergePersonalCandidates(rows){
  const byIdentity=new Map();
  for(const row of rows){
    if(!row?.identityKey||!row?.id||!Array.isArray(row.evidence))continue;
    const identity=candidateIdentity(row),key=identity.recordingId||row.id;
    const prior=byIdentity.get(key);
    if(!prior){byIdentity.set(key,{...structuredClone(row),identity});continue;}
    prior.evidence.push(...row.evidence.filter(e=>!prior.evidence.some(p=>p.sourceId===e.sourceId&&p.url===e.url)));
    prior.destinations.push(...row.destinations.filter(d=>!prior.destinations.some(p=>p.url===d.url)));
    prior.sourceIds=distinct([...(prior.sourceIds||[]),...(row.sourceIds||[]),...row.evidence.map(e=>e.sourceId)]);
    if(row.dateBasis==='confirmed-release'){
      const a=prior.dateInterval||releaseInterval(prior.releaseDate),b=row.dateInterval||releaseInterval(row.releaseDate);
      if(a&&b&&(a.to<b.from||b.to<a.from)){prior.dateConflict=true;continue;}
      if(row.datePrecision!=='day')continue;
      prior.releaseDate=row.releaseDate;prior.dateBasis='confirmed-release';prior.datePrecision='day';prior.label ||= row.label;
      prior.dateInterval=row.dateInterval||releaseInterval(row.releaseDate);
      prior.release ||= row.release;
    }
  }
  return [...byIdentity.values()];
}
export function eligibleResearchCandidate(candidate,window){
  const identity=candidateIdentity(candidate);
  return !candidate.dateConflict&&identity.status==='resolved'&&candidate.dateBasis==='confirmed-release'&&candidate.datePrecision==='day'&&
    inWindow(candidate.releaseDate,window)&&candidate.evidence?.some(e=>e.claimType==='release'&&
      e.recordingId===identity.recordingId&&e.claimDate===candidate.releaseDate&&safeEvidenceUrl(e.url))&&
    verifiedDestinations(candidate).length>0;
}
export function researchTrack(candidate){
  const links=verifiedDestinations(candidate)
    .map(d=>({kind:d.kind==='buy'?'store-listening':'listen',url:d.url}));
  return {id:candidate.id,artistName:candidate.artistName,title:candidate.title,release:candidate.release||null,
    label:candidate.label||null,releaseDate:candidate.releaseDate,lane:3,score:55,preview:null,links,
    reason:'Verified day-precision release listing; audio characteristics have not been assessed.',
    canonicalRecordingId:candidateIdentity(candidate).recordingId,
    provenance:{retrieval:candidate.retrieval||null,basis:candidate.retrieval?'researched-index':'fresh-research',sources:distinct(candidate.evidence.map(e=>e.sourceId)),
      evidence:candidate.evidence.filter(e=>safeEvidenceUrl(e.url)).map(e=>({sourceId:e.sourceId,url:e.url,
        claim:e.claimType,checkedAt:e.checkedAt,datePrecision:e.claimPrecision||'unknown'}))}};
}
export async function finishPersonalResearch(client,runId,counts){
  if(!runId)return;
  check(await client.from('dp_research_runs').update({fresh_selected:counts.fresh,fallback_selected:counts.fallback})
    .eq('id',runId));
}
export async function researchPersonalJob(client,job,{now=new Date(),fetcher=fetch,sources=registry.sources,
  braveKey=process.env.BRAVE_SEARCH_API_KEY,soundcloudToken,throttleMs=1100,hybridEnabled=false,embeddingOptions={}}={}){
  if(hybridEnabled)await retrievalReadiness(client);
  const graph=hybridEnabled?await expandMusicGraph(client,job.profile_snapshot):[];
  const plan=planPersonalResearch(job.profile_snapshot,new Date(job.scheduled_at),{graph});
  const runId=randomUUID();
  const existing=check(await client.from('dp_research_runs').select('id').eq('drop_id',job.id).maybeSingle());
  const id=existing?.id||runId;
  check(await client.from('dp_research_runs').upsert({id,user_id:job.user_id,drop_id:job.id,status:'running',
    window_from:plan.window.from,window_to:plan.window.to,started_at:now.toISOString(),finished_at:null},{onConflict:'drop_id'}));
  // Keep source discovery bounded while reserving a small, explicit verification budget.
  const budget=createRequestBudget({fetcher,maxRequests:plan.maxRequests+8,deadlineMs:plan.deadlineMs});
  const coverage=[],all=[];
  if(soundcloudToken===undefined&&sources.some(s=>s.enabled&&s.kind==='soundcloud-tracks')){
    try{soundcloudToken=await soundCloudTokenForRun(fetcher);}catch{soundcloudToken=null;}
  }
  for(const source of sources){
    const outcome=await runSourceAdapter(source,{plan,budget,now,soundcloudToken,braveKey,throttleMs,expandRelationships:hybridEnabled});
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
  const verificationCoverage={attempted:0,verified:0,unverified:0,reasons:{}};
  const verificationFetcher=async(url,options={})=>{
    const u=new URL(url);
    return budget.get(url,{host:u.hostname,path:/^\\/ws\\/2\\//,headers:options.headers||{}});
  };
  // Every candidate that can reach selection receives an exact title/artist/date/provider check.
  // Leads remain visible in telemetry but never become recommendations without this pass.
  for(const candidate of merged.slice(0,24)){
    if(budget.count>=plan.maxRequests+8)break;
    verificationCoverage.attempted++;
    try{
      const verified=await verifyReleaseCandidate(candidate,{fetcher:verificationFetcher});
      Object.assign(candidate,applyReleaseVerification(candidate,verified));
      if(verified.state==='verified')verificationCoverage.verified++;
      else {verificationCoverage.unverified++;verificationCoverage.reasons[verified.reason]=(verificationCoverage.reasons[verified.reason]||0)+1;}
    }catch(error){
      verificationCoverage.unverified++;
      const reason=error?.message||'verification-error';
      verificationCoverage.reasons[reason]=(verificationCoverage.reasons[reason]||0)+1;
      candidate.verificationState='unverified';candidate.verificationReason=reason;
    }
  }
  if(merged.length){
    const previous=check(await client.from('dp_research_candidates').select('id,release_date,date_precision,facts')
      .in('id',merged.map(c=>c.id)))||[];
    const oldById=new Map(previous.map(c=>[c.id,c]));
    for(const candidate of merged){
      const old=oldById.get(candidate.id),prior=old?.facts?.dateInterval||releaseInterval(old?.release_date);
      const incoming=candidate.dateInterval||releaseInterval(candidate.releaseDate);
      if(old?.facts?.dateConflict||prior&&incoming&&(prior.to<incoming.from||incoming.to<prior.from))candidate.dateConflict=true;
    }
  }
  const candidateRows=[],observationRows=[],joinRows=[],events=[],artists=[],recordings=[],credits=[],editions=[];
  for(const candidate of merged){
    const eligible=eligibleResearchCandidate(candidate,plan.window);
    const identity=candidateIdentity(candidate),interval=candidate.dateInterval||releaseInterval(candidate.releaseDate);
    if(identity.status==='resolved'){
      recordings.push({id:identity.recordingId,title:candidate.title,source_url:identity.sourceUrl,
        original_date_from:interval?.from||null,original_date_to:interval?.to||null,date_precision:interval?.precision||'unknown'});
      for(const artist of identity.artists||[]){
        artists.push({id:artist.id,name:artist.name,source_url:'https://musicbrainz.org/artist/'+artist.id.slice(9)});
        credits.push({recording_id:identity.recordingId,artist_id:artist.id,credited_name:artist.creditedName,source_url:identity.sourceUrl});
      }
      for(const edition of identity.editions||[])editions.push({recording_id:identity.recordingId,edition_id:edition.id,
        title:edition.title,source_url:edition.sourceUrl,date_from:edition.date?.from||null,date_to:edition.date?.to||null,date_precision:edition.date?.precision||'unknown'});
    }
    candidateRows.push({id:candidate.id,identity_key:candidate.identityKey,
      artist_name:candidate.artistName,title:candidate.title,release_date:candidate.releaseDate||null,
      date_precision:candidate.datePrecision||'unknown',date_basis:candidate.dateBasis,
      recording_id:identity.recordingId,identity_status:candidate.dateConflict?'conflict':identity.status,
      label:candidate.label||null,facts:{release:candidate.release||null,dateConflict:!!candidate.dateConflict,dateInterval:interval},last_seen_at:now.toISOString()});
    for(const evidence of candidate.evidence){
      if(!safeEvidenceUrl(evidence.url))continue;
      const claimInterval=evidence.claimInterval||releaseInterval(evidence.claimDate);
      events.push({id:evidenceId([id,candidate.id,evidence.sourceId,evidence.url,evidence.claimType,claimInterval]),
        candidate_id:candidate.id,recording_id:identity.recordingId,source_id:evidence.sourceId,source_url:evidence.url,
        claim_type:evidence.claimType||'lead',claim_from:claimInterval?.from||null,claim_to:claimInterval?.to||null,
        claim_precision:claimInterval?.precision||'unknown',observed_at:evidence.checkedAt||now.toISOString(),
        verification:evidence.verification==='verified'?'verified':evidence.claimType==='release'?'source-claim':'unverified'});
      observationRows.push({candidate_id:candidate.id,source_id:evidence.sourceId,
        source_url:evidence.url,observed_at:now.toISOString(),claim_type:evidence.claimType==='release-page'?'release':evidence.claimType||'lead',
        claim_date:evidence.claimDate||null,claim_precision:evidence.claimPrecision||'unknown',facts:{fields:evidence.fields}});
    }
    joinRows.push({run_id:id,candidate_id:candidate.id,eligible});
    if(eligible)tracks.push(researchTrack(candidate));
  }
  const save=async(table,rows,onConflict)=>{
    if(rows.length)check(await client.from(table).upsert([...new Map(rows.map(r=>[onConflict.split(',').map(k=>r[k]).join('\0'),r])).values()],{onConflict}));
  };
  await save('dp_music_artists',artists,'id');
  // Keep the initial identity snapshot; later/conflicting claims live in immutable evidence events.
  if(recordings.length)check(await client.from('dp_music_recordings').upsert(recordings,{onConflict:'id',ignoreDuplicates:true}));
  await save('dp_music_credits',credits,'recording_id,artist_id,credited_name');
  await save('dp_music_editions',editions,'recording_id,edition_id');
  if(candidateRows.length){
    check(await client.from('dp_research_candidates').upsert(candidateRows,{onConflict:'id'}));
    check(await client.from('dp_research_observations').upsert(observationRows,{onConflict:'candidate_id,source_id,source_url'}));
    check(await client.from('dp_research_run_candidates').upsert(joinRows,{onConflict:'run_id,candidate_id'}));
    if(events.length)check(await client.from('dp_music_evidence').upsert(events,{onConflict:'id',ignoreDuplicates:true}));
  }
  let retrieval=null;const observedIds=new Set(merged.map(c=>c.id));
  if(hybridEnabled){
    await persistMusicGraph(client,merged,now);
    const expanded=await expandMusicGraph(client,job.profile_snapshot);
    const found=await retrieveMusic(client,plan,expanded,{fetcher,...embeddingOptions});
    retrieval=found.report;
    for(const candidate of found.candidates){
      observedIds.add(candidate.id);
      const eligible=eligibleResearchCandidate(candidate,plan.window);
      if(eligible&&!tracks.some(t=>t.canonicalRecordingId===candidateIdentity(candidate).recordingId))tracks.push(researchTrack(candidate));
      check(await client.from('dp_research_run_candidates').upsert({run_id:id,candidate_id:candidate.id,eligible},{onConflict:'run_id,candidate_id'}));
    }
    coverage.push({sourceId:'hybrid-retrieval',status:'ready',state:retrieval.semanticState==='ready'?'complete':'partial',
      semanticState:retrieval.semanticState,requests:retrieval.requests,candidates:found.candidates.length});
  }
  const usable=coverage.filter(s=>s.status==='ready').length;
  const complete=coverage.filter(s=>s.status!=='disabled').every(s=>s.status==='ready'&&s.state==='complete');
  check(await client.from('dp_research_runs').update({status:complete?'complete':usable||coverage.some(s=>s.requests)?'partial':'access-blocked',
    ...(retrieval?{retrieval}:{}),request_count:budget.count+(retrieval?.requests||0),candidate_count:observedIds.size,eligible_count:tracks.length,coverage:[...coverage,{sourceId:'release-verification',status:verificationCoverage.verified?'ready':'partial',state:verificationCoverage.unverified?'partial':'complete',...verificationCoverage}],finished_at:now.toISOString()}).eq('id',id));
  return {runId:id,tracks,coverage:[...coverage,{sourceId:'release-verification',...verificationCoverage}],verification:verificationCoverage,requestCount:budget.count+(retrieval?.requests||0),eligibleCount:tracks.length};
}
