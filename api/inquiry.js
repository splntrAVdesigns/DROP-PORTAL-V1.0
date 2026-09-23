import crypto from 'node:crypto';

const OWNER='splntrAVdesigns';
const REPO='DROP-PORTAL-V1.0';
const BRANCH='main';
const INQUIRY_PATH='weekly-inquiry/current.json';
const SCHEDULE_PATH='weekly-schedule/current.json';

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
function headers(token){
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
    headers:{...headers(token),...(options.headers||{})}
  });
  const text=await response.text();
  let body=null;
  try{body=text?JSON.parse(text):null}catch{body={message:text}}
  if(!response.ok){
    const error=new Error(body?.message||`GitHub API failed ${response.status}`);
    error.status=response.status;
    throw error;
  }
  return body;
}
async function readFile(token,path){
  const file=await gh(token,`contents/${path}?ref=${encodeURIComponent(BRANCH)}`);
  const content=Buffer.from(String(file.content||'').replace(/\n/g,''),'base64').toString('utf8');
  return{sha:file.sha,value:JSON.parse(content)};
}
const numeric=['future','deep','jungle','depth','experimental','floor','darkness','breaks'];
function validProfile(profile){
  return profile&&typeof profile==='object'&&
    numeric.every(key=>Number.isFinite(profile[key])&&profile[key]>=0&&profile[key]<=100)&&
    Number.isInteger(profile.count)&&profile.count>=10&&profile.count<=30&&
    typeof profile.mixes==='boolean';
}
function localDate(timestamp,zone='America/Chicago'){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date(timestamp));
  const map=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{error:'method_not_allowed'});
  }
  const adminKey=process.env.DROP_PORTAL_ADMIN_KEY;
  const token=process.env.GITHUB_TOKEN;
  if(!adminKey||!token){
    return send(res,503,{
      error:'inquiry_write_not_configured',
      message:'Server-side Tuner write credentials are not configured.'
    });
  }
  if(!safeEqual(req.headers['x-drop-portal-admin-key'],adminKey)){
    return send(res,401,{error:'unauthorized',message:'Tuner admin access is required.'});
  }
  let body=req.body;
  if(typeof body==='string'){
    try{body=JSON.parse(body)}catch{return send(res,400,{error:'invalid_json'})}
  }
  const scope=body?.scope,clear=body?.clear===true,profile=body?.profile;
  if(!['base','weekly'].includes(scope)){
    return send(res,400,{error:'invalid_scope'});
  }
  if(!clear&&!validProfile(profile)){
    return send(res,400,{error:'invalid_profile',message:'Tuner profile failed validation.'});
  }
  if(clear&&scope!=='weekly'){
    return send(res,400,{error:'invalid_clear',message:'Only the weekly override can be cleared.'});
  }

  try{
    const [inquiryFile,scheduleFile]=await Promise.all([
      readFile(token,INQUIRY_PATH),
      readFile(token,SCHEDULE_PATH)
    ]);
    const inquiry={...inquiryFile.value};
    const schedule=scheduleFile.value;
    const targetDate=localDate(schedule.nextDropAt,schedule.timezone);
    if(scope==='base')inquiry.baseProfile={...profile};
    if(scope==='weekly'){
      inquiry.weeklyOverride=clear?null:{...profile};
      inquiry.status=clear?'base-only':'queued';
    }else{
      inquiry.status=inquiry.weeklyOverride?'queued':'base-only';
    }
    inquiry.targetDropDate=targetDate;
    inquiry.updatedAt=new Date().toISOString();

    const result=await gh(token,`contents/${INQUIRY_PATH}`,{
      method:'PUT',
      body:JSON.stringify({
        message:`Phase 2.7: sync ${scope} tuner profile`,
        content:Buffer.from(JSON.stringify(inquiry,null,2)+'\n').toString('base64'),
        sha:inquiryFile.sha,
        branch:BRANCH
      })
    });
    return send(res,200,{
      ok:true,
      inquiry,
      targetDropDate:targetDate,
      commitSha:result.commit?.sha||null
    });
  }catch(error){
    const status=error.status===409?409:502;
    return send(res,status,{error:'inquiry_write_failed',message:error.message});
  }
}
