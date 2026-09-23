import {validProfile,cleanProfile,localDate} from '../lib/contracts.js';
import {send,authorize,readState,requireRevision,writeState,requestBody,failure} from '../lib/repository.js';
export default async function handler(req,res) {
  try {
    if(req.method==='GET') return send(res,200,await readState());
    if(req.method!=='POST') {res.setHeader('Allow','GET, POST');return send(res,405,{error:'method_not_allowed'});}
    authorize(req);
    const body=requestBody(req),{scope,profile}=body,clear=body.clear===true;
    if(!['base','weekly'].includes(scope)||clear&&scope!=='weekly'||!clear&&!validProfile(profile)) return send(res,400,{message:'Choose a valid Tuner profile and scope.'});
    const state=await readState();requireRevision(body,state);
    const inquiry={...state.inquiry,targetDropDate:localDate(state.schedule.nextDropAt),updatedAt:new Date().toISOString()};
    if(scope==='base')inquiry.baseProfile=cleanProfile(profile);
    else inquiry.weeklyOverride=clear?null:cleanProfile(profile);
    inquiry.status=inquiry.weeklyOverride?'queued':'base-only';
    return send(res,200,await writeState(state,{inquiry},`Phase 2.8: save ${scope} discovery profile`));
  } catch(error) {return failure(res,error);}
}
