import crypto from 'node:crypto';
import {validPublisherSession} from './publisher-session.js';
import {validInquiry,validSchedule} from './contracts.js';
const ROOT='https://api.github.com/repos/splntrAVdesigns/DROP-PORTAL-V1.0/';
export const PATHS={schedule:'weekly-schedule/current.json',inquiry:'weekly-inquiry/current.json'};
export function send(res,status,body) { res.status(status); res.setHeader('Cache-Control','no-store, max-age=0'); return res.json(body); }
export function authorize(req) {
  const key=process.env.DROP_PORTAL_ADMIN_KEY,token=process.env.GITHUB_TOKEN;
  if(!key||!token) throw Object.assign(new Error('Publisher saves are not configured.'),{status:503});
  // Logged-in publisher sessions use a short-lived HttpOnly, same-origin cookie.
  // Existing authenticated test clients may still send the admin key header.
  if(validPublisherSession(req,key))return;
  const supplied=req.headers['x-drop-portal-admin-key'];
  if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(key)||!crypto.timingSafeEqual(Buffer.from(key),Buffer.from(supplied))) throw Object.assign(new Error('Publisher admin access is required.'),{status:401});
}
export async function gh(path,options={}) {
  const token=process.env.GITHUB_TOKEN;
  const response=await fetch(ROOT+path,{...options,signal:AbortSignal.timeout(8000),headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})},cache:'no-store'});
  const body=await response.json();
  if(!response.ok) throw Object.assign(new Error(response.status===409||response.status===422?'Publisher state changed. Reload before saving.':'Publisher repository request failed.'),{status:response.status===409||response.status===422?409:502});
  return body;
}
export async function readState() {
  const ref=await gh('git/ref/heads/main'),revision=ref.object.sha;
  const values=await Promise.all(Object.values(PATHS).map(async path=>{
    const file=await gh(`contents/${path}?ref=${revision}`);
    return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
  }));
  const [schedule,inquiry]=values;
  if(!validSchedule(schedule)||!validInquiry(inquiry)) throw Object.assign(new Error('Publisher state failed validation.'),{status:502});
  return {schedule,inquiry,revision,publisherConfigured:Boolean(process.env.DROP_PORTAL_ADMIN_KEY&&process.env.GITHUB_TOKEN)};
}
export function requireRevision(body,state) {
  if(typeof body.expectedRevision!=='string'||body.expectedRevision!==state.revision) throw Object.assign(new Error('Publisher state changed. Reload the saved settings before retrying; your edits are still here.'),{status:409});
}
export async function writeState(state,changes,message) {
  const commit=await gh('git/commits/'+state.revision);
  const tree=await gh('git/trees',{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree:Object.entries(changes).map(([key,value])=>({path:PATHS[key],mode:'100644',type:'blob',content:JSON.stringify(value,null,2)+'\n'}))})});
  const next=await gh('git/commits',{method:'POST',body:JSON.stringify({message,tree:tree.sha,parents:[state.revision]})});
  // Non-forced update rejects concurrent commits. All reads used the same parent.
  await gh('git/refs/heads/main',{method:'PATCH',body:JSON.stringify({sha:next.sha,force:false})});
  return {...state,...changes,revision:next.sha,commitSha:next.sha,ok:true};
}
export function requestBody(req) {
  try { const value=typeof req.body==='string'?JSON.parse(req.body):req.body; if(!value||typeof value!=='object')throw Error(); return value; }
  catch { throw Object.assign(new Error('Invalid request body.'),{status:400}); }
}
export function failure(res,error) { return send(res,error.status||502,{error:error.status===409?'publisher_conflict':'publisher_request_failed',message:error.message}); }
