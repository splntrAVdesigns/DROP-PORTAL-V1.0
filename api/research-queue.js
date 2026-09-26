import {authorize,send,requestBody} from '../lib/repository.js';
import {researchSnapshot,reviewResearchCandidate} from '../lib/research-runtime.js';

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(res,405,{error:'method_not_allowed'});}
  try{
    authorize(req);
    if(req.method==='POST'){
      const body=requestBody(req);
      return send(res,200,await reviewResearchCandidate(body.id,body.decision));
    }
    const {registry,queue}=await researchSnapshot();
    return send(res,200,{sources:registry.sources.map(({id,kind,name,enabled})=>({id,kind,name,enabled})),
      updatedAt:queue.updatedAt,candidates:queue.candidates,runs:queue.runs});
  }catch(error){return send(res,error.status||502,{error:'research_queue_unavailable',message:error.message});}
}
