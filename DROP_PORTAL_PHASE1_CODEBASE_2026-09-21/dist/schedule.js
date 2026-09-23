import {validSchedule,validInquiry,zoneParts} from './contracts.js';
export const scheduleState={status:'idle',source:'none',data:null,inquiry:null,revision:null,message:null};
export async function publisherRequest(url,options={}) {
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(options.method==='POST'?35000:15000),...options});
  let body;try{body=await response.json()}catch{}
  if(!response.ok)throw Object.assign(new Error(body?.message||`Publisher request failed (${response.status}).`),{status:response.status});
  return body;
}
export function acceptPublisherState(result) {
  if(!validSchedule(result.schedule)||!validInquiry(result.inquiry)||typeof result.revision!=='string')throw Error('Publisher returned invalid settings.');
  Object.assign(scheduleState,{status:'ready',source:'api',data:result.schedule,inquiry:result.inquiry,revision:result.revision,message:null});
  return result;
}
export async function loadSchedule() {
  scheduleState.status='loading';
  try{acceptPublisherState(await publisherRequest('/api/schedule?v='+Date.now()));return true;}
  catch(error){scheduleState.status='error';scheduleState.message=error.message;return false;}
}
export async function saveSchedule({date,time,mode,adminKey,expectedRevision}) {
  return acceptPublisherState(await publisherRequest('/api/schedule',{method:'POST',headers:{'Content-Type':'application/json','X-DROP-PORTAL-ADMIN-KEY':adminKey||''},body:JSON.stringify({date,time,mode,expectedRevision})}));
}
export function formatNextDrop(schedule=scheduleState.data) {
  if(!schedule?.nextDropAt)return 'SCHEDULE UNAVAILABLE';
  return new Intl.DateTimeFormat('en-US',{timeZone:schedule.timezone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(schedule.nextDropAt)).toUpperCase();
}
export function nextDropFields(schedule=scheduleState.data) {
  if(!schedule)return {date:'',time:'19:00'};
  const p=zoneParts(schedule.nextDropAt,schedule.timezone);return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function scheduleLabel() {
  if(scheduleState.status==='idle'||scheduleState.status==='loading')return 'CHECKING SCHEDULE';
  if(scheduleState.status==='error')return 'SCHEDULE UNAVAILABLE';
  const s=scheduleState.data;
  if(s.status==='paused')return 'SCHEDULE PAUSED';
  if(s.status==='publishing')return 'PUBLISHING';
  return Date.parse(s.nextDropAt)<=Date.now()?'DROP DUE · AWAITING PUBLICATION':'NEXT DROP ARMED';
}
export function scheduleMode(schedule=scheduleState.data){return schedule?.override?'one-off':'weekly-default';}
