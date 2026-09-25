import {TIMEZONE,WEEKDAYS,scheduleInstant,localDate,validProfile,cleanProfile} from '../lib/contracts.js';
import {send,authorize,readState,requireRevision,writeState,requestBody,failure} from '../lib/repository.js';

// Atomically save the active Tuner tab and the selected next-drop schedule.
// No browser token is accepted or stored; GitHub credentials stay in Vercel.
export default async function handler(req,res) {
  try {
    if(req.method!=='POST') {
      res.setHeader('Allow','POST');
      return send(res,405,{error:'method_not_allowed'});
    }
    authorize(req);
    const body=requestBody(req);
    const {scope,profile,date,time,mode}=body;
    if(!['base','weekly'].includes(scope)||!validProfile(profile)) {
      return send(res,400,{message:'Choose a valid Base or This Week profile.'});
    }
    if(!['one-off','weekly-default'].includes(mode)) {
      return send(res,400,{message:'Choose This Drop Only or Make Weekly Default.'});
    }
    let candidate;
    try{candidate=scheduleInstant(date,time);}
    catch(error){return send(res,400,{message:error.message});}
    if(candidate.getTime()<=Date.now()) {
      return send(res,400,{message:'Choose a future date and time for the next drop.'});
    }

    const state=await readState();
    requireRevision(body,state);
    if(state.schedule.status==='publishing') {
      return send(res,409,{error:'publisher_conflict',message:'A drop is currently publishing. Reload after publication before changing settings.'});
    }
    const now=new Date().toISOString();
    const schedule={
      ...state.schedule,
      timezone:TIMEZONE,
      defaultSchedule:mode==='weekly-default'
        ?{weekday:WEEKDAYS[new Date(date+'T12:00:00Z').getUTCDay()],time}
        :state.schedule.defaultSchedule,
      override:mode==='one-off'?{mode:'one-off',date,time}:null,
      nextDropAt:candidate.toISOString(),
      status:'armed',
      updatedAt:now
    };
    const inquiry={
      ...state.inquiry,
      targetDropDate:localDate(candidate),
      updatedAt:now
    };
    if(scope==='base') inquiry.baseProfile=cleanProfile(profile);
    else inquiry.weeklyOverride=cleanProfile(profile);
    inquiry.status=inquiry.weeklyOverride?'queued':'base-only';

    // One non-forced Git commit updates both files at the same revision.
    return send(res,200,await writeState(
      state,{schedule,inquiry},'Phase 2.8.1: save Tuner preferences and upcoming drop together'
    ));
  }catch(error){return failure(res,error);}
}
