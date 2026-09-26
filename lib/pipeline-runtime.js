import {gh,readState} from './repository.js';
import {localOccurrence,stagePath,payloadPath,createStage,validateStage,makePublication} from './pipeline.js';
const ROOT='https://api.github.com/repos/splntrAVdesigns/DROP-PORTAL-V1.0/';
export class PipelineError extends Error {
  constructor(step,message,status=422){super(message);this.name='PipelineError';this.step=step;this.status=status;}
}
const json=v=>JSON.stringify(v,null,2)+'\n';
async function readJsonAt(path,revision,optional=false){
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new PipelineError('read','Server has no GitHub write token',503);
  const response=await fetch(ROOT+'contents/'+path+'?ref='+encodeURIComponent(revision),{
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},
    signal:AbortSignal.timeout(10000),cache:'no-store'
  });
  if(response.status===404&&optional)return null;
  if(!response.ok)throw new PipelineError('read',path+': GitHub HTTP '+response.status,502);
  const file=await response.json();
  try{return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));}
  catch{throw new PipelineError('read',path+': invalid JSON in repository',502);}
}
async function snapshot({withArchive=true}={}){
  const state=await readState();
  const manifest=await readJsonAt('weekly-feed/drops/index.json',state.revision);
  if(manifest?.schemaVersion!==1||!Array.isArray(manifest.drops))throw new PipelineError('manifest','Invalid publication index',422);
  const entries=withArchive?manifest.drops.slice(0,8):[];
  for(const entry of entries){
    if(!/^\.\/[a-zA-Z0-9._-]+\.json$/.test(entry.url))throw new PipelineError('manifest','Unsafe historical path',422);
  }
  const archive=await Promise.all(entries.map(entry=>
    readJsonAt('weekly-feed/drops/'+entry.url.slice(2),state.revision)
  ));
  return {...state,manifest,archive};
}
async function commitFiles(revision,files,message){
  const commit=await gh('git/commits/'+revision);
  const tree=await gh('git/trees',{method:'POST',body:JSON.stringify({
    base_tree:commit.tree.sha,
    tree:Object.entries(files).map(([path,value])=>({
      path,mode:'100644',type:'blob',content:json(value)
    }))
  })});
  const next=await gh('git/commits',{method:'POST',body:JSON.stringify({
    message,tree:tree.sha,parents:[revision]
  })});
  await gh('git/refs/heads/main',{method:'PATCH',
    body:JSON.stringify({sha:next.sha,force:false})});
  return next.sha;
}
function assertEqual(actual,expected,step){
  if(JSON.stringify(actual)!==JSON.stringify(expected))
    throw new PipelineError(step,'GitHub readback does not match committed payload',502);
}
export async function pipelineStatus(){
  const s=await snapshot({withArchive:false});
  const date=localOccurrence(s.schedule),path=stagePath(date);
  const published=s.manifest.drops.find(x=>x.url==='./'+date+'.json');
  if(published)return {
    status:'published',date,scheduledAt:s.schedule.nextDropAt,
    stagePath:path,manifestId:published.id
  };
  const stage=await readJsonAt(path,s.revision,true);
  if(!stage)return {
    status:Date.now()>=Date.parse(s.schedule.nextDropAt)?'due_without_stage':'awaiting_research',
    date,scheduledAt:s.schedule.nextDropAt,stagePath:path,
    message:'Research staging is not ready. The existing fallback publisher may curate after the deadline.'
  };
  if(stage.stageVersion!==1){
    return {
      status:'external_stage',date,scheduledAt:s.schedule.nextDropAt,
      stagePath:path,message:'Existing research stage uses the previous publisher contract; the new engine cannot independently certify it.'
    };
  }
  try{
    validateStage(stage,s);
    return {
      status:'staged',date,scheduledAt:s.schedule.nextDropAt,
      stagePath:path,trackCount:stage.candidate.tracks.length,
      previewCount:stage.candidate.tracks.filter(t=>!!t.preview).length,
      stagedAt:stage.stagedAt
    };
  }catch(error){
    return {status:'stale_stage',date,scheduledAt:s.schedule.nextDropAt,
      stagePath:path,message:error.message};
  }
}
export async function stageCandidate(candidate,now=new Date(),{dryRun=false}={}){
  const s=await snapshot();
  if(s.schedule.status!=='armed')throw new PipelineError('schedule','Schedule is not armed',409);
  const date=localOccurrence(s.schedule),path=stagePath(date);
  if(s.manifest.drops.some(d=>d.url==='./'+date+'.json'))
    throw new PipelineError('manifest','Occurrence was already published',409);
  let stage;
  try{stage=createStage(candidate,s,now);}
  catch(error){throw new PipelineError('validation',error.message,422);}
  const existing=await readJsonAt(path,s.revision,true);
  // Do not update a live staged file if its exact approved research is unchanged.
  if(existing?.captured?.nextDropAt===stage.captured.nextDropAt&&
     existing?.captured?.inquiryUpdatedAt===stage.captured.inquiryUpdatedAt&&
     JSON.stringify(existing.candidate)===JSON.stringify(stage.candidate)){
    return {status:'staged',idempotent:true,date,path,previewCount:stage.candidate.tracks.filter(t=>t.preview).length};
  }
  if(dryRun)return {status:'validated',date,path,trackCount:stage.candidate.tracks.length,commitSha:null};
  let commitSha;
  try{commitSha=await commitFiles(s.revision,{[path]:stage},'Phase 2.9: validated staging for '+date);}
  catch(error){throw new PipelineError('stage_write',error.message,error.status===409?409:502);}
  const readBack=await readJsonAt(path,commitSha);
  assertEqual(readBack,stage,'stage_readback');
  return {
    status:'staged',date,path,commitSha,trackCount:stage.candidate.tracks.length,
    previewCount:stage.candidate.tracks.filter(t=>!!t.preview).length,
    evidenceCount:Object.keys(stage.candidate.evidence).length
  };
}
export async function publishStaged(now=new Date(),{dryRun=false}={}){
  const s=await snapshot();
  const schedule=s.schedule,date=localOccurrence(schedule);
  if(schedule.status!=='armed')return {status:'not_armed',date};
  if(now.getTime()<Date.parse(schedule.nextDropAt))return {status:'not_due',date,scheduledAt:schedule.nextDropAt};
  if(s.manifest.drops.some(x=>x.url==='./'+date+'.json'))
    return {status:'already_published',date};
  const path=stagePath(date),stage=await readJsonAt(path,s.revision,true);
  if(!stage)throw new PipelineError('staging','No validated research staged for scheduled occurrence',424);
  let plan;
  try{plan=makePublication(stage,s,now);}
  catch(error){throw new PipelineError('validation',error.message,422);}
  if(dryRun)return {
    status:'ready_to_publish',date,path,
    trackCount:plan.payload.tracks.length,
    previewCount:plan.payload.tracks.filter(t=>!!t.preview).length
  };
  const paths={
    [payloadPath(date)]:plan.payload,
    'weekly-feed/drops/index.json':plan.index,
    'weekly-schedule/current.json':plan.rolledSchedule,
    'weekly-inquiry/current.json':plan.rolledInquiry
  };
  let commitSha;
  try{commitSha=await commitFiles(s.revision,paths,'Phase 2.9: publish and roll scheduled drop '+date);}
  catch(error){throw new PipelineError('publication_write',error.message,error.status===409?409:502);}
  const [payload,index,rolledSchedule,rolledInquiry]=await Promise.all(Object.entries(paths).map(
    ([path])=>readJsonAt(path,commitSha)
  ));
  assertEqual(payload,plan.payload,'payload_readback');
  assertEqual(index,plan.index,'manifest_readback');
  assertEqual(rolledSchedule,plan.rolledSchedule,'schedule_readback');
  assertEqual(rolledInquiry,plan.rolledInquiry,'inquiry_readback');
  return {
    status:'published',date,dropId:plan.id,commitSha,scheduledAt:schedule.nextDropAt,
    publishedAt:plan.payload.drop.publishedAt,
    payloadPath:payloadPath(date),archiveCount:plan.index.drops.length-1,
    trackCount:plan.payload.tracks.length,
    previewCount:plan.payload.tracks.filter(t=>!!t.preview).length,
    nextDropAt:plan.rolledSchedule.nextDropAt
  };
}
