import {createClient} from '@supabase/supabase-js';
import {sameOrigin} from './publisher-session.js';
const COOKIE_OPTIONS='Path=/api; HttpOnly; Secure; SameSite=Strict';
export const accessCookie='dp_personal_access',refreshCookie='dp_personal_refresh';
export function personalConfigured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_ANON_KEY&&process.env.DROP_PORTAL_BETA_EMAILS);}
export function allowedEmail(email){return typeof email==='string'&&process.env.DROP_PORTAL_BETA_EMAILS?.split(',').map(s=>s.trim().toLowerCase()).includes(email.toLowerCase());}
export function personalClient(token){
  const url=process.env.SUPABASE_URL;
  if(!personalConfigured()||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url))throw Object.assign(Error('Personal accounts are awaiting setup.'),{status:503});
  return createClient(url,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{...(token?{headers:{Authorization:'Bearer '+token}}:{}),fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})}});
}
export function cookie(req,name){
  const part=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='));
  try{return part?decodeURIComponent(part.slice(name.length+1)):null}catch{return null}
}
export function sessionCookies(session){
  return [`${accessCookie}=${encodeURIComponent(session.access_token)}; ${COOKIE_OPTIONS}; Max-Age=${Math.min(3600,session.expires_in||3600)}`,
    `${refreshCookie}=${encodeURIComponent(session.refresh_token)}; ${COOKIE_OPTIONS}; Max-Age=2592000`];
}
export const clearPersonalCookies=()=>[accessCookie,refreshCookie].map(name=>`${name}=; ${COOKIE_OPTIONS}; Max-Age=0`);
export async function authenticatePersonal(req){
  const token=cookie(req,accessCookie);if(!token)throw Object.assign(Error('Sign in to your personal account.'),{status:401});
  const client=personalClient(token),{data,error}=await client.auth.getUser(token);
  if(error||!data.user||!allowedEmail(data.user.email))throw Object.assign(Error('Your session expired. Sign in again.'),{status:401});
  return {client,user:data.user};
}
export function requirePersonalOrigin(req){if(!sameOrigin(req))throw Object.assign(Error('Cross-origin access denied.'),{status:403});}
export function personalBody(req){
  try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>64000)throw Error();return body;
  }catch{throw Object.assign(Error('Invalid request.'),{status:400});}
}
export function personalReply(res,status,data){res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');return res.status(status).json(data);}
export function personalFailure(res,error){return personalReply(res,error.status||502,{message:error.status?error.message:'Personal storage could not be reached. Your changes have not been confirmed.'});}
export function checkDatabase(error){if(error)throw Object.assign(Error(error.code==='40001'?'Settings changed on another device. Reload before saving.':'Personal storage is unavailable. Check the database setup.'),{status:error.code==='40001'?409:503});}
