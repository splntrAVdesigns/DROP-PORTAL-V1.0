import {TIMEZONE,WEEKDAYS,scheduleInstant,localDate} from '../lib/contracts.js';
import {send,authorize,readState,requireRevision,writeState,requestBody,failure} from '../lib/repository.js';
export default async function handler(req,res) {
  try {
    if(req.method==='GET') return send(res,200,await readState());
    if(req.method!=='POST') {res.setHeader('Allow','GET, POST');return send(res,405,{error:'method_not_allowed'});}
    authorize(req);
    const body=requestBody(req),{date,time,mode}=body;
    if(!['one-off','weekly-default'].includes(mode)) return send(res,400,{message:'Choose a supported schedule mode.'});
    let candidate;try{candidate=scheduleInstant(date,time)}catch(error){return send(res,400,{message:error.message});}
    if(candidate.getTime()<=Date.now()) return send(res,400,{message:'The next drop must be in the future.'});
    const state=await readState();requireRevision(body,state);
    const now=new Date().toISOString();
    const schedule={...state.schedule,timezone:TIMEZONE,defaultSchedule:mode==='weekly-default'?{weekday:WEEKDAYS[new Date(date+'T12:00:00Z').getUTCDay()],time}:state.schedule.defaultSchedule,override:mode==='one-off'?{mode:'one-off',date,time}:null,nextDropAt:candidate.toISOString(),status:'armed',updatedAt:now};
    const inquiry={...state.inquiry,targetDropDate:localDate(candidate),updatedAt:now};
    return send(res,200,await writeState(state,{schedule,inquiry},'Phase 2.8: save publication schedule and inquiry target'));
  } catch(error) {return failure(res,error);}
}
