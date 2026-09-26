import {send} from '../lib/repository.js';
import {pipelineStatus} from '../lib/pipeline-runtime.js';
// Read-only operational telemetry: never exposes credentials or unapproved candidates.
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(res,405,{error:'method_not_allowed'});}
  try{return send(res,200,await pipelineStatus());}
  catch(error){return send(res,503,{status:'unavailable',message:'Publication status unavailable. Existing drop remains visible.'});}
}
