import crypto from 'node:crypto';

const OWNER='splntrAVdesigns';
const REPO='DROP-PORTAL-V1.0';
const BRANCH='main';
const SCHEDULE_PATH='weekly-schedule/current.json';
const INQUIRY_PATH='weekly-inquiry/current.json';
const TIMEZONE='America/Chicago';
const RAW_BASE=`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;

function send(res,status,body){
  res.status(status);
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.json(body);
}
function safeEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
async function publicJson(path){
  const response=await fetch(RAW_BASE+path+'?v='+Date.now(),{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error(`GitHub read failed ${response.status} for ${path}`);
  return response.json();
}
function ghHeaders(token){
  return{
    Accept:'application/vnd.github+json',
    Authorization:`Bearer ${token}`,
    'X-GitHub-Api-Version':'2022-11-28',
    'Content-Type':'application/json'
  };
}
async function gh(token,path,options={}){
  const response=await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`,{
    ...options,
    headers:{...ghHeaders(token),...(options.headers||{})}
  });
  const text=await response.text();
  let body=null;
  try{body=text?JSON.parse(text):null}catch{body={message:text}}
  if(!response.ok){
    const error=new Error(body?.message||`GitHub API failed ${response.status}`);
    error.status=response.status;
    error.body=body;
    throw error;
  }
  return body;
}
async function readRepoJson(token,path){
  const file=await gh(token,`contents/${path}?ref=${encodeURIComponent(BRANCH)}`);
  const decoded=Buffer.from(String(file.content||'').replace(/\n/g,''),'base64').toString('utf8');
  return JSON.parse(decoded);
}
const WEEKDAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
function weekdayForDate(date){
  return WEEKDAYS[new Date(date+'T12:00:00Z').getUTCDay()];
}
function partsInZone(date,zone){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function offsetMs(date,zone){
  const p=partsInZone(date,zone);
  const asUTC=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  return asUTC-Math.floor(date.getTime()/1000)*1000;
}
function localToInstant(date,time,zone){
  const [y,m,d]=date.split('-').map(Number);
  const [hh,mm]=time.split(':').map(Number);
  const wall=Date.UTC(y,m-1,d,hh,mm,0);
  let guess=new Date(wall);
  let offset=offsetMs(guess,zone);
  let instant=new Date(wall-offset);
  const corrected=offsetMs(instant,zone);
  if(corrected!==offset)instant=new Date(wall-corrected);
  return instant;
}
function offsetText(instant,zone){
  const mins=Math.round(offsetMs(instant,zone)/60000);
  const sign=mins>=0?'+':'-';
  const abs=Math.abs(mins);
  return sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
}
function zonedIso(date,time,zone){
  const instant=localToInstant(date,time,zone);
  return `${date}T${time}:00${offsetText(instant,zone)}`;
}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))}
function validHour(value){return /^(?:[01]\d|2[0-3]):00$/.test(value)}
async function atomicWrite(token,schedule,inquiry){
  const ref=await gh(token,`git/ref/heads/${BRANCH}`);
  const headSha=ref.object.sha;
  const commit=await gh(token,`git/commits/${headSha}`);
  const entries=[];
  for(const [path,value] of [[SCHEDULE_PATH,schedule],[INQUIRY_PATH,inquiry]]){
    const blob=await gh(token,'git/blobs',{
      method:'POST',
      body:JSON.stringify({content:JSON.stringify(value,null,2)+'\n',encoding:'utf-8'})
    });
    entries.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree=await gh(token,'git/trees',{
    method:'POST',
    body:JSON.stringify({base_tree:commit.tree.sha,tree:entries})
  });
  const next=await gh(token,'git/commits',{
    method:'POST',
    body:JSON.stringify({
      message:'Phase 2.7: update dynamic publication schedule',
      tree:tree.sha,
      parents:[headSha]
    })
  });
  try{
    await gh(token,`git/refs/heads/${BRANCH}`,{
      method:'PATCH',
      body:JSON.stringify({sha:next.sha,force:false})
    });
  }catch(error){
    if(error.status===422){
      const conflict=new Error('Schedule changed while saving. Reload and retry.');
      conflict.status=409;
      throw conflict;
    }
    throw error;
  }
  return next.sha;
}

export default async function handler(req,res){
  if(req.method==='GET'){
    try{
      const schedule=await publicJson(SCHEDULE_PATH);
      return send(res,200,{schedule});
    }catch(error){
      return send(res,502,{error:'schedule_read_failed',message:error.message});
    }
  }
  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:'method_not_allowed'});
  }

  const adminKey=process.env.DROP_PORTAL_ADMIN_KEY;
  const githubToken=process.env.GITHUB_TOKEN;
  if(!adminKey||!githubToken){
    return send(res,503,{
      error:'schedule_write_not_configured',
      message:'Server-side schedule write credentials are not configured.'
    });
  }
  if(!safeEqual(req.headers['x-drop-portal-admin-key'],adminKey)){
    return send(res,401,{error:'unauthorized',message:'Schedule admin access is required.'});
  }

  let body=req.body;
  if(typeof body==='string'){
    try{body=JSON.parse(body)}catch{return send(res,400,{error:'invalid_json'})}
  }
  const date=body?.date,time=body?.time,mode=body?.mode;
  if(!validDate(date)||!validHour(time)||!['one-off','weekly-default'].includes(mode)){
    return send(res,400,{
      error:'invalid_schedule',
      message:'Choose a valid future date, a whole-hour time, and a supported schedule mode.'
    });
  }
  const candidate=localToInstant(date,time,TIMEZONE);
  if(candidate.getTime()<=Date.now()){
    return send(res,400,{error:'schedule_in_past',message:'The next production drop must be in the future.'});
  }

  try{
    const token=githubToken;
    const [currentSchedule,inquiry]=await Promise.all([
      readRepoJson(token,SCHEDULE_PATH),
      readRepoJson(token,INQUIRY_PATH)
    ]);
    const now=new Date().toISOString();
    const schedule={
      ...currentSchedule,
      schemaVersion:1,
      timezone:TIMEZONE,
      defaultSchedule:mode==='weekly-default'
        ?{weekday:weekdayForDate(date),time}
        :currentSchedule.defaultSchedule,
      override:mode==='one-off'?{mode:'one-off',date,time}:null,
      nextDropAt:zonedIso(date,time,TIMEZONE),
      status:'armed',
      updatedAt:now
    };
    const nextInquiry={
      ...inquiry,
      status:inquiry.weeklyOverride?'queued':'base-only',
      targetDropDate:date,
      updatedAt:now
    };
    const commitSha=await atomicWrite(token,schedule,nextInquiry);
    return send(res,200,{
      ok:true,
      schedule,
      inquiryTargetDropDate:nextInquiry.targetDropDate,
      commitSha
    });
  }catch(error){
    const status=error.status===409?409:502;
    return send(res,status,{
      error:status===409?'schedule_conflict':'schedule_write_failed',
      message:error.message
    });
  }
}
