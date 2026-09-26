import {authenticatePersonal,requirePersonalOrigin,personalBody,personalReply,personalFailure,checkDatabase} from '../lib/personal-backend.js';
import {PERSONAL_DEFAULTS,cleanPersonalProfile,personalSearchRequest} from '../lib/personal-contracts.js';
import {validDate,localDate} from '../lib/contracts.js';
export function defaultPersonalState(){return {base_profile:structuredClone(PERSONAL_DEFAULTS),weekly_profile:null,target_date:null,learning_enabled:false,revision:0};}
export function makePersonalDataHandler(deps={}){
  const authenticate=deps.authenticate||authenticatePersonal;
  return async(req,res)=>{try{
    if(!['GET','POST','DELETE'].includes(req.method))return personalReply(res,405,{message:'Method not allowed.'});
    if(req.method!=='GET')requirePersonalOrigin(req);
    const {client,user}=await authenticate(req);
    if((req.method!=='GET'||req.headers['x-personal-account'])&&req.headers['x-personal-account']!==user.id)return personalReply(res,409,{message:'Account changed. Reload before continuing.'});
    const read=async()=>{
      const result=await client.from('dp_personal_profiles').select('*').eq('user_id',user.id).maybeSingle();checkDatabase(result.error);
      return result.data||defaultPersonalState();
    };
    if(req.method==='GET'){
      const state=await read();
      const offset=Number(req.query?.offset||0);
      if(!Number.isSafeInteger(offset)||offset<0)return personalReply(res,400,{message:'Invalid page offset.'});
      const feedback=await client.from('dp_feedback').select('track_id,kind,value,revision,updated_at').eq('user_id',user.id).order('track_id').order('kind').range(offset,offset+999);checkDatabase(feedback.error);
      const date=req.query?.targetDate||state.target_date||localDate(new Date());
      if(!validDate(date))return personalReply(res,400,{message:'Invalid target date.'});
      const result={state,feedback:feedback.data,nextOffset:feedback.data.length===1000?offset+1000:null,searchRequest:personalSearchRequest(state,date)};
      if(req.query?.export==='true'){
        const events=await client.from('dp_feedback_events').select('track_id,kind,value,meaning,occurred_at').eq('user_id',user.id).gte('occurred_at',new Date(Date.now()-180*86400000).toISOString()).order('id').range(offset,offset+999);checkDatabase(events.error);
        result.events=events.data;result.exportedAt=new Date().toISOString();result.nextOffset=feedback.data.length===1000||events.data.length===1000?offset+1000:null;
      }
      return personalReply(res,200,result);
    }
    if(req.method==='DELETE'){
      const body=personalBody(req);if(body.confirm!=='DELETE MY TASTE')return personalReply(res,400,{message:'Type DELETE MY TASTE to confirm.'});
      const {error}=await client.rpc('dp_clear_personal_data');checkDatabase(error);return personalReply(res,200,{deleted:true});
    }
    const body=personalBody(req);
    if(body.action==='save-profile'){
      if(!['base','weekly','clear-weekly','learning'].includes(body.scope)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)return personalReply(res,400,{message:'Invalid preference save.'});
      const state=await read();
      if(state.revision!==body.expectedRevision)return personalReply(res,409,{message:'Settings changed on another device. Reload before saving.'});
      if(['base','weekly'].includes(body.scope)){
        let profile;try{profile=cleanPersonalProfile(body.profile);}catch(e){return personalReply(res,400,{message:e.message});}
        if(profile.focus.mode!=='recent')return personalReply(res,422,{message:'Archive and Future source coverage is still being validated.'});
        if(body.scope==='base')state.base_profile=profile;
        else {if(!validDate(body.targetDate)||body.targetDate<localDate(new Date()))return personalReply(res,400,{message:'Choose the current or a future drop date.'});state.weekly_profile=profile;state.target_date=body.targetDate;}
      }
      if(body.scope==='clear-weekly'){state.weekly_profile=null;state.target_date=null;}
      if(body.scope==='learning'){if(typeof body.enabled!=='boolean')return personalReply(res,400,{message:'Choose a learning setting.'});state.learning_enabled=body.enabled;}
      const result=await client.rpc('dp_save_profile',{p_base:state.base_profile,p_weekly:state.weekly_profile,p_target:state.target_date,p_learning:state.learning_enabled,p_expected:body.expectedRevision});checkDatabase(result.error);
      return personalReply(res,200,{state:result.data[0],saved:true});
    }
    if(body.action==='feedback'){
      const items=body.items;
      if(!Array.isArray(items)||!items.length||items.length>100||items.some(v=>!v||typeof v.trackId!=='string'||!/^[\w-]{1,128}$/.test(v.trackId)||!['saved','heard','hidden'].includes(v.kind)||typeof v.value!=='boolean'||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0))return personalReply(res,400,{message:'Invalid feedback batch.'});
      const results=[];
      for(const item of items){
        const result=await client.rpc('dp_set_feedback',{p_track:item.trackId,p_kind:item.kind,p_value:item.value,p_expected:item.expectedRevision,p_import:body.import===true});
        if(result.error){return personalReply(res,result.error.code==='40001'?409:503,{message:'Some changes were not saved. Reload to see confirmed changes.',results});}
        results.push(result.data[0]);
      }
      return personalReply(res,200,{results});
    }
    return personalReply(res,400,{message:'Unknown personal data action.'});
  }catch(e){return personalFailure(res,e);}};
}
export default makePersonalDataHandler();
