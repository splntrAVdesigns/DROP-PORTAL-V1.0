export const scheduleState={status:'idle',source:'none',data:null,message:null};

const API='/api/schedule';
const SNAPSHOT='/weekly-schedule/current.json';

function validSchedule(value){
  return value&&value.schemaVersion===1&&value.timezone==='America/Chicago'&&
    value.defaultSchedule&&typeof value.defaultSchedule.weekday==='string'&&
    /^(?:[01]\\d|2[0-3]):00$/.test(value.defaultSchedule.time||'')&&
    typeof value.nextDropAt==='string'&&['armed','publishing','paused'].includes(value.status);
}
async function json(url,options){
  const response=await fetch(url,{cache:'no-store',...options});
  let body=null;
  try{body=await response.json()}catch{}
  if(!response.ok){
    const error=new Error(body?.message||('Schedule request failed '+response.status));
    error.status=response.status;
    error.code=body?.error||null;
    throw error;
  }
  return body;
}
export async function loadSchedule(){
  scheduleState.status='loading';
  try{
    const result=await json(API+'?v='+Date.now());
    if(!validSchedule(result.schedule))throw Error('Invalid schedule response');
    scheduleState.status='ready';scheduleState.source='api';scheduleState.data=result.schedule;scheduleState.message=null;
    return true;
  }catch(apiError){
    try{
      const snapshot=await json(SNAPSHOT+'?v='+Date.now());
      if(!validSchedule(snapshot))throw Error('Invalid schedule snapshot');
      scheduleState.status='ready';scheduleState.source='snapshot';scheduleState.data=snapshot;scheduleState.message='Deployed schedule snapshot';
      return true;
    }catch(snapshotError){
      scheduleState.status='error';scheduleState.source='none';scheduleState.data=null;scheduleState.message=apiError.message;
      return false;
    }
  }
}
export async function saveSchedule({date,time,mode,adminKey}){
  const result=await json(API,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-DROP-PORTAL-ADMIN-KEY':adminKey||''},
    body:JSON.stringify({date,time,mode})
  });
  if(!validSchedule(result.schedule))throw Error('Server returned an invalid schedule');
  scheduleState.status='ready';scheduleState.source='api';scheduleState.data=result.schedule;scheduleState.message=null;
  return result;
}
function parts(value,zone){
  const formatter=new Intl.DateTimeFormat('en-US',{
    timeZone:zone,weekday:'short',year:'numeric',month:'short',day:'2-digit',
    hour:'numeric',minute:'2-digit',timeZoneName:'short'
  });
  return formatter.format(new Date(value)).replace(',','');
}
export function formatNextDrop(schedule=scheduleState.data){
  if(!schedule?.nextDropAt)return 'SCHEDULE UNAVAILABLE';
  try{return parts(schedule.nextDropAt,schedule.timezone).toUpperCase()}catch{return schedule.nextDropAt}
}
export function nextDropFields(schedule=scheduleState.data){
  if(!schedule?.nextDropAt)return{date:'',time:'19:00'};
  const formatter=new Intl.DateTimeFormat('en-CA',{
    timeZone:schedule.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  });
  const map=Object.fromEntries(formatter.formatToParts(new Date(schedule.nextDropAt)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return{date:`${map.year}-${map.month}-${map.day}`,time:`${map.hour}:00`};
}
export function scheduleMode(schedule=scheduleState.data){
  return schedule?.override?'one-off':'weekly-default';
}
