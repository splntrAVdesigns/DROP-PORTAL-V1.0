const PREFIX='drop-portal:';
const COOKIE_PREFIX='drop_portal_';

function cookieName(key){return COOKIE_PREFIX+encodeURIComponent(key).replace(/%/g,'_')}
function readCookie(key){
  try{
    const name=cookieName(key)+'=';
    const hit=document.cookie.split('; ').find(part=>part.startsWith(name));
    return hit?decodeURIComponent(hit.slice(name.length)):null;
  }catch{return null}
}
function writeCookie(key,raw){
  try{
    const secure=location.protocol==='https:'?'; Secure':'';
    document.cookie=`${cookieName(key)}=${encodeURIComponent(raw)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
    return readCookie(key)===raw;
  }catch{return false}
}

export function read(key,fallback){
  let raw=null;
  try{raw=localStorage.getItem(PREFIX+key)}catch{}
  if(raw==null){
    raw=readCookie(key);
    if(raw!=null){
      try{localStorage.setItem(PREFIX+key,raw)}catch{}
    }
  }
  if(raw==null)return fallback;
  try{return JSON.parse(raw)??fallback}catch{return fallback}
}

export function write(key,value){
  let raw;
  try{raw=JSON.stringify(value)}catch{return false}
  let localOk=false;
  try{
    localStorage.setItem(PREFIX+key,raw);
    localOk=localStorage.getItem(PREFIX+key)===raw;
  }catch{}
  const cookieOk=writeCookie(key,raw);
  return localOk||cookieOk;
}
