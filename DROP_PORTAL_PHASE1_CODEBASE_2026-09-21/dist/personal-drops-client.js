import {personal,loadPersonal} from './personal.js';
export const privateDrops={owner:null,plan:null,drops:[],loading:false,error:''};
export async function privateRequest(options={},retry=true){
  const response=await fetch('/api/personal-drops',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),
    ...options,headers:{'Content-Type':'application/json',...(personal.user?{'X-Personal-Account':personal.user.id}:{}),...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(response.status===401&&retry&&personal.user){await loadPersonal();if(personal.user)return privateRequest(options,false);}
  if(!response.ok)throw Object.assign(Error(data.message||'Your drop could not be saved.'),{status:response.status});
  return data;
}
export async function loadPrivateDrops(){
  const owner=personal.user?.id;
  if(!owner){Object.assign(privateDrops,{owner:null,plan:null,drops:[],loading:false,error:''});window.dispatchEvent(new Event('privatedropschange'));return;}
  if(owner!==privateDrops.owner)Object.assign(privateDrops,{owner,plan:null,drops:[],error:''});
  privateDrops.loading=true;window.dispatchEvent(new Event('privatedropschange'));
  try{const data=await privateRequest();if(personal.user?.id===owner)Object.assign(privateDrops,{plan:data.plan,drops:data.drops,error:''});}
  catch(e){if(personal.user?.id===owner)privateDrops.error=e.message;}
  finally{if(personal.user?.id===owner){privateDrops.loading=false;window.dispatchEvent(new Event('privatedropschange'));}}
}
export async function savePrivatePlan(input){const result=await privateRequest({method:'POST',body:JSON.stringify({action:'save-plan',...input})});await loadPrivateDrops();return result;}
export async function requestOneTimeDig(input){const result=await privateRequest({method:'POST',body:JSON.stringify({action:'one-time-dig',...input})});await loadPrivateDrops();return result;}
