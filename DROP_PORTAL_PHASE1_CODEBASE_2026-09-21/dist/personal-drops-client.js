import {personal,loadPersonal} from './personal.js';
export const privateDrops={owner:null,plan:null,drops:[],loading:false,error:''};
let loadEpoch=0;
export async function privateRequest(options={},retry=true,owner=personal.user?.id){
  if(!owner||personal.user?.id!==owner)throw Error('Your account changed. Sign in and retry.');
  const response=await fetch('/api/personal-drops',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),
    ...options,headers:{'Content-Type':'application/json','X-Personal-Account':owner,...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(response.status===401&&retry&&personal.user){await loadPersonal();if(personal.user?.id===owner)return privateRequest(options,false,owner);throw Error('Your account changed. Sign in and retry.');}
  if(personal.user?.id!==owner)throw Error('Your account changed. Sign in and retry.');
  if(!response.ok)throw Object.assign(Error(data.message||'Your drop could not be saved.'),{status:response.status});
  return data;
}
export async function loadPrivateDrops(){
  const owner=personal.user?.id,epoch=++loadEpoch;
  if(!owner){Object.assign(privateDrops,{owner:null,plan:null,drops:[],loading:false,error:''});window.dispatchEvent(new Event('privatedropschange'));return;}
  if(owner!==privateDrops.owner)Object.assign(privateDrops,{owner,plan:null,drops:[],error:''});
  privateDrops.loading=true;window.dispatchEvent(new Event('privatedropschange'));
  try{const data=await privateRequest();if(epoch===loadEpoch&&personal.user?.id===owner)Object.assign(privateDrops,{plan:data.plan,drops:data.drops,error:''});}
  catch(e){if(epoch===loadEpoch&&personal.user?.id===owner)privateDrops.error=e.message;}
  finally{if(epoch===loadEpoch&&personal.user?.id===owner){privateDrops.loading=false;window.dispatchEvent(new Event('privatedropschange'));}}
}
export async function savePrivatePlan(input){const result=await privateRequest({method:'POST',body:JSON.stringify({action:'save-plan',...input})});await loadPrivateDrops();return result;}
export async function requestOneTimeDig(input){const result=await privateRequest({method:'POST',body:JSON.stringify({action:'one-time-dig',...input})});await loadPrivateDrops();return result;}
