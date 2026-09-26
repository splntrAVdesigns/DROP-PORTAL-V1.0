import crypto from 'node:crypto';

// A bounded same-origin publisher session; no admin key or GitHub token is
// persisted in the browser or emitted to client-side JavaScript.
const NAME='dp_publisher_session';
const MAX_AGE_SECONDS=8*60*60;
const cookieOptions='Path=/api; HttpOnly; Secure; SameSite=Strict';

function signingKey(key){
  return crypto.createHash('sha256').update('drop-portal-publisher-session-v1\0'+key).digest();
}
function signature(payload,key){
  return crypto.createHmac('sha256',signingKey(key)).update(payload).digest('base64url');
}
export function issuePublisherSession(key){
  const expiry=Date.now()+MAX_AGE_SECONDS*1000;
  const nonce=crypto.randomBytes(18).toString('base64url');
  const payload=expiry+'.'+nonce;
  return NAME+'='+encodeURIComponent(payload+'.'+signature(payload,key))+'; '+cookieOptions+'; Max-Age='+MAX_AGE_SECONDS;
}
export function clearPublisherSession(){
  return NAME+'=; '+cookieOptions+'; Max-Age=0';
}
export function constantTimeEqual(input,reference){
  if(typeof input!=='string'||typeof reference!=='string')return false;
  const a=Buffer.from(input),b=Buffer.from(reference);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function cookieValue(req){
  const c=req.headers.cookie;
  if(typeof c!=='string')return null;
  const pair=c.split(';').map(x=>x.trim()).find(x=>x.startsWith(NAME+'='));
  if(!pair)return null;
  try{return decodeURIComponent(pair.slice(NAME.length+1));}catch{return null;}
}
export function sameOrigin(req){
  // Cookie-authorized mutation requires a browser same-origin Origin header.
  // Shared-secret header authorization remains available to test clients.
  const origin=req.headers.origin;
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(typeof origin!=='string'||typeof host!=='string')return false;
  try{
    const uri=new URL(origin);
    return uri.protocol==='https:'&&uri.host===String(host).split(',')[0].trim();
  }catch{return false;}
}
export function validPublisherSession(req,key){
  if(!key||!sameOrigin(req))return false;
  const raw=cookieValue(req);
  if(!raw)return false;
  const parts=raw.split('.');
  if(parts.length!==3)return false;
  const [exp,nonce,sig]=parts;
  if(!/^\d{13}$/.test(exp)||!(/^[A-Za-z0-9_-]{24}$/.test(nonce)))return false;
  const remaining=Number(exp)-Date.now();
  if(remaining<=0||remaining>MAX_AGE_SECONDS*1000)return false;
  return constantTimeEqual(sig,signature(exp+'.'+nonce,key));
}
export function publisherSessionTTL(){return MAX_AGE_SECONDS;}
