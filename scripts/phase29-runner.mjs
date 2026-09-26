import {pipelineStatus,stageCandidate,publishStaged} from '../lib/pipeline-runtime.js';
import {readState} from '../lib/repository.js';
import {captureOccurrence,isOfficialUrl} from '../lib/pipeline.js';
const mode=process.argv.find(a=>a.startsWith('--mode='))?.split('=')[1]||'cycle';
const dryRun=process.argv.includes('--dry-run');
const source=process.env.DROP_PORTAL_SOURCE_FEED_URL||null;
async function probeOfficialSources(candidate){
  // Verify URL reachability without following redirects or reaching arbitrary hosts.
  const urls=[...new Set(Object.values(candidate.evidence||{}).map(e=>e.sourceUrl))];
  for(const url of urls){
    if(!isOfficialUrl(url))throw new Error('Official source host not permitted: '+url);
    const response=await fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw new Error('Official metadata evidence not independently reachable: HTTP '+response.status+' '+url);
  }
}
async function preflight(){
  const status=await pipelineStatus();
  if(status.status==='staged'||status.status==='published'||status.status==='stale_stage')return status;
  const diff=Date.parse(status.scheduledAt)-Date.now();
  if(diff>90*60000||diff<0)return {status:'outside_preflight',date:status.date};
  if(!source)return {status:'source_not_configured',date:status.date,note:'Connect a verified discovery feed or submit an authenticated candidate via /api/engine-stage.'};
  const u=new URL(source);
  if(u.protocol!=='https:'||u.username||u.password)throw Error('Discovery feed endpoint must be HTTPS with no URL credentials');
  const state=await readState(),captured=captureOccurrence(state.schedule,state.inquiry);
  u.searchParams.set('nextDropAt',captured.nextDropAt);
  u.searchParams.set('inquiryUpdatedAt',captured.inquiryUpdatedAt);
  const res=await fetch(u.toString(),{signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!res.ok)throw Error('Discovery feed HTTP '+res.status);
  const payload=await res.json();
  const candidate=payload.candidate;
  if(!candidate)throw Error('Discovery feed returned no candidate');
  await probeOfficialSources(candidate);
  return await stageCandidate(candidate,new Date(),{dryRun});
}
async function main(){
  if(!['cycle','preflight','publish','status'].includes(mode))throw Error('Unknown mode');
  if(!process.env.GITHUB_TOKEN)throw Error('Actions GitHub token not configured');
  if(mode==='status'){console.log(JSON.stringify(await pipelineStatus()));return;}
  if(mode==='preflight'){console.log(JSON.stringify(await preflight()));return;}
  if(mode==='cycle'){
    const stage=await preflight();console.log('PREFLIGHT '+JSON.stringify(stage));
  }
  const result=await publishStaged(new Date(),{dryRun});
  console.log('PUBLICATION '+JSON.stringify(result));
  if(result.status==='not_due'||result.status==='not_armed'||result.status==='already_published')return;
  if(result.status!=='published'&&result.status!=='ready_to_publish')process.exitCode=2;
}
main().catch(error=>{
  console.error('PIPELINE_FAILURE stage='+(error.step||'runner')+' error='+error.message);
  process.exitCode=1;
});
