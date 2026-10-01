import {authenticatePersonal,requirePersonalOrigin,personalBody,personalReply,personalFailure,checkDatabase} from '../lib/personal-backend.js';
import {PERSONAL_DEFAULTS,cleanPersonalProfile,effectivePersonalProfile} from '../lib/personal-contracts.js';
import {localDate} from '../lib/contracts.js';
import {nextPersonalOccurrence,oneTimeInstant} from '../lib/personal-discovery.js';

export function makePersonalDropsHandler(deps={}){
  const authenticate=deps.authenticate||authenticatePersonal;
  return async(req,res)=>{try{
    if(!['GET','POST'].includes(req.method))return personalReply(res,405,{message:'Method not allowed.'});
    if(req.method==='POST')requirePersonalOrigin(req);
    const {client,user}=await authenticate(req);
    if((req.method==='POST'||req.headers['x-personal-account'])&&req.headers['x-personal-account']!==user.id)
      return personalReply(res,409,{message:'Account changed. Reload before continuing.'});
    if(req.method==='GET'){
      const [plan,drops]=await Promise.all([
        client.from('dp_personal_plans').select('*').eq('user_id',user.id).maybeSingle(),
        client.from('dp_personal_drops').select('*').eq('user_id',user.id).order('scheduled_at',{ascending:false}).limit(30)
      ]);checkDatabase(plan.error);checkDatabase(drops.error);
      return personalReply(res,200,{plan:plan.data,drops:drops.data});
    }
    const body=personalBody(req);
    const {data:state,error:readError}=await client.from('dp_personal_profiles').select('*').eq('user_id',user.id).maybeSingle();checkDatabase(readError);
    if(body.action==='save-plan'){
      if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==(state?.revision||0))
        return personalReply(res,409,{message:'Taste changed. Reload and save again.'});
      let profile;try{profile=cleanPersonalProfile(body.profile);}catch(e){return personalReply(res,400,{message:e.message});}
      if(profile.focus.mode!=='recent')return personalReply(res,422,{message:'Archive and Future modes are awaiting verified coverage.'});
      let next;try{next=nextPersonalOccurrence(body.weekday,body.time);}catch(e){return personalReply(res,400,{message:e.message});}
      const base=body.scope==='weekly'?(state?.base_profile||PERSONAL_DEFAULTS):profile;
      const weekly=body.scope==='weekly'?profile:state?.weekly_profile||null;
      const target=body.scope==='weekly'?localDate(next):state?.target_date||null;
      if(!['base','weekly'].includes(body.scope))return personalReply(res,400,{message:'Choose Base or This Week.'});
      const saved=await client.rpc('dp_save_personal_plan',{p_base:base,p_weekly:weekly,p_target:target,
        p_learning:state?.learning_enabled||false,p_expected:body.expectedRevision,p_weekday:body.weekday,p_time:body.time,p_next:next.toISOString()});checkDatabase(saved.error);
      return personalReply(res,200,{plan:saved.data[0],nextDropAt:next.toISOString()});
    }
    if(body.action==='one-time-dig'){
      let at;try{at=oneTimeInstant(body.date,body.time);}catch(e){return personalReply(res,400,{message:e.message});}
      const profile=effectivePersonalProfile(state||{base_profile:PERSONAL_DEFAULTS,weekly_profile:null,target_date:null},localDate(at));
      const queued=await client.rpc('dp_request_one_time',{p_at:at.toISOString(),p_profile:profile});checkDatabase(queued.error);
      return personalReply(res,200,{drop:queued.data[0]});
    }
    return personalReply(res,400,{message:'Unknown drop action.'});
  }catch(e){return personalFailure(res,e);}};
}
export default makePersonalDropsHandler();
