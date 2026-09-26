export const pipelineState={status:'checking',scheduledAt:null,date:null,trackCount:null,previewCount:null,message:null};
export async function loadPipelineStatus(){
  try{
    const res=await fetch('/api/pipeline-status?v='+Date.now(),{
      cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    if(!res.ok)throw Error('Preflight status request failed');
    const data=await res.json();
    Object.assign(pipelineState,data);
    return true;
  }catch(error){
    Object.assign(pipelineState,{status:'unavailable',message:error.message});
    return false;
  }
}
export function preflightLabel(scheduledAt){
  if(pipelineState.scheduledAt&&pipelineState.scheduledAt!==scheduledAt)return 'STAGING CHECK PENDING';
  switch(pipelineState.status){
    case 'staged':return 'PREFLIGHT STAGED · '+pipelineState.trackCount+' TRACKS';
    case 'published':return 'PUBLICATION VERIFIED';
    case 'stale_stage':return 'STAGING OUTDATED · REVIEW REQUIRED';
    case 'external_stage':return 'EXTERNAL PREFLIGHT · UNVERIFIED HERE';
    case 'due_without_stage':return 'DUE · RESEARCH NOT STAGED';
    case 'awaiting_research':return 'RESEARCH NOT STAGED';
    default:return 'STAGING STATUS CHECKING';
  }
}
