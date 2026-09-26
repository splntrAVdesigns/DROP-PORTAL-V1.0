import {authorize,send,requestBody} from '../lib/repository.js';
import {stageCandidate,PipelineError} from '../lib/pipeline-runtime.js';
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'method_not_allowed'});}
  try{
    authorize(req);
    const body=requestBody(req);
    const result=await stageCandidate(body.candidate);
    return send(res,200,result);
  }catch(error){
    return send(res,error instanceof PipelineError?error.status:error.status||502,{
      error:'stage_failed',stage:error.step||'unknown',message:error.message
    });
  }
}
