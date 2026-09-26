// Session credentials stay in HttpOnly cookies. Private profiles stay in memory.
export const personal={configured:null,checked:false,user:null,state:null,feedback:{},loading:false,error:''};
let refreshPromise=null,loadEpoch=0,feedbackQueue=Promise.resolve();
function announce(){window.dispatchEvent(new Event('personalchange'));}
async function request(path,options={},retry=true){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),...options,headers:{'Content-Type':'application/json',...(personal.user?{'X-Personal-Account':personal.user.id}:{}),...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(response.status===401&&retry&&personal.user){
    refreshPromise??=request('/api/personal-session',{method:'POST',body:JSON.stringify({action:'refresh'})},false).finally(()=>refreshPromise=null);
    try{await refreshPromise;return request(path,options,false);}catch{personal.user=null;personal.state=null;personal.feedback={};announce();}
  }
  if(!response.ok)throw Object.assign(Error(data.message||'Personal account request failed.'),{status:response.status});
  return data;
}
async function readAllPersonal(exporting=false){
  let result=null,offset=0;
  for(let page=0;page<100;page++){
    const data=await request('/api/personal-data?offset='+offset+(exporting?'&export=true':''));
    if(!result)result=data;else {if(data.state.revision!==result.state.revision)throw Error('Your preferences changed while loading. Please reload.');result.feedback.push(...data.feedback);if(exporting)result.events.push(...data.events);}
    if(data.nextOffset===null){result.nextOffset=null;return result;}offset=data.nextOffset;
  }
  throw Error('This account is too large for an in-browser export. Contact the publisher for a database export.');
}
export async function loadPersonal(){
  const epoch=++loadEpoch;personal.loading=true;personal.error='';
  try{
    let status=await request('/api/personal-session',{},false);
    if(status.canRefresh){await request('/api/personal-session',{method:'POST',body:JSON.stringify({action:'refresh'})},false);status=await request('/api/personal-session',{},false);}
    if(epoch!==loadEpoch)return;
    if(personal.user?.id!==status.user?.id){personal.state=null;personal.feedback={};}
    personal.configured=status.configured;personal.user=status.user;
    if(status.user){
      const data=await readAllPersonal();if(epoch!==loadEpoch)return;
      personal.state=data.state;personal.feedback=Object.fromEntries(data.feedback.map(row=>[row.track_id+':'+row.kind,row]));
    }
  }catch(e){if(epoch===loadEpoch)personal.error=e.message;}
  finally{if(epoch===loadEpoch){personal.checked=true;personal.loading=false;announce();}}
}
export async function sendCode(email){return request('/api/personal-session',{method:'POST',body:JSON.stringify({action:'request-code',email})},false);}
export async function verifyCode(email,code){await request('/api/personal-session',{method:'POST',body:JSON.stringify({action:'verify-code',email,code})},false);await loadPersonal();}
export async function signOut(){await feedbackQueue;await request('/api/personal-session',{method:'DELETE'},false);++loadEpoch;personal.user=null;personal.state=null;personal.feedback={};personal.error='';announce();}
export async function savePersonal(input){
  if(!personal.user)throw Error('Sign in before saving personal preferences.');
  if(!personal.state)throw Error('Reload your personal account before saving.');
  const owner=personal.user.id;
  const result=await request('/api/personal-data',{method:'POST',body:JSON.stringify({action:'save-profile',expectedRevision:personal.state?.revision||0,...input})});
  if(personal.user?.id===owner){personal.state=result.state;announce();}
  return result;
}
export function personalInteractions(){
  const result={};for(const row of Object.values(personal.feedback)){const item=result[row.track_id]??={stamps:{}};item[row.kind]=row.value;item.stamps[row.kind]=Date.parse(row.updated_at);item.updatedAt=Math.max(item.updatedAt||0,Date.parse(row.updated_at));}return result;
}
export function setPersonalFeedback(trackId,kind,value){
  const owner=personal.user?.id;
  const task=feedbackQueue.then(async()=>{
    if(!owner||personal.user?.id!==owner)throw Error('Account changed. Please retry.');
    if(!personal.state)throw Error('Reload your personal account before saving.');
    if(!personal.state.revision)await savePersonal({scope:'base',profile:personal.state.base_profile});
    const prior=personal.feedback[trackId+':'+kind];
    const result=await request('/api/personal-data',{method:'POST',body:JSON.stringify({action:'feedback',items:[{trackId,kind,value,expectedRevision:prior?.revision||0}]})});
    if(personal.user?.id===owner){for(const row of result.results)personal.feedback[row.track_id+':'+row.kind]=row;announce();}
  });
  feedbackQueue=task.catch(()=>{});return task;
}
export async function importPersonalHistory(local){
  if(!personal.state)throw Error('Reload your personal account before saving.');
    if(!personal.state.revision)await savePersonal({scope:'base',profile:personal.state.base_profile});
  const items=Object.entries(local).flatMap(([trackId,state])=>['saved','heard','hidden'].filter(kind=>typeof state[kind]==='boolean').map(kind=>({trackId,kind,value:state[kind],expectedRevision:0})));
  for(let offset=0;offset<items.length;offset+=50)await request('/api/personal-data',{method:'POST',body:JSON.stringify({action:'feedback',import:true,items:items.slice(offset,offset+50)})});
  await loadPersonal();return items.length;
}
export async function exportPersonal(){return readAllPersonal(true);}
export async function deletePersonal(confirm){await feedbackQueue;await request('/api/personal-data',{method:'DELETE',body:JSON.stringify({confirm})});await loadPersonal();}
