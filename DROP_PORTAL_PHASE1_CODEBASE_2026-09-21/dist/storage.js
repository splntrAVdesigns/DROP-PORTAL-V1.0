const PREFIX='drop-portal:';
const COOKIE_PREFIX='drop_portal_';
const BACKUP_SUFFIX=':backup';
const STAMP_SUFFIX=':stamp';

function cookieName(key){return COOKIE_PREFIX+encodeURIComponent(key).replace(/%/g,'_')}
function safeParse(raw){try{return raw==null?null:JSON.parse(raw)}catch{return null}}
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
function readLocal(name){try{return localStorage.getItem(name)}catch{return null}}
function writeLocal(name,value){try{localStorage.setItem(name,value);return localStorage.getItem(name)===value}catch{return false}}

export function read(key,fallback){
  const primaryRaw=readLocal(PREFIX+key);
  const primary=safeParse(primaryRaw);
  const primaryStamp=Number(readLocal(PREFIX+key+STAMP_SUFFIX)||0);

  const backup=safeParse(readLocal(PREFIX+key+BACKUP_SUFFIX));
  if(backup&&typeof backup==='object'&&Number(backup.writtenAt)>primaryStamp&&backup.value!=null){
    const raw=JSON.stringify(backup.value);
    writeLocal(PREFIX+key,raw);
    writeLocal(PREFIX+key+STAMP_SUFFIX,String(backup.writtenAt));
    return backup.value;
  }
  if(primary!=null)return primary;

  const cookieRaw=readCookie(key);
  const cookie=safeParse(cookieRaw);
  if(cookie!=null){
    const now=Date.now();
    writeLocal(PREFIX+key,cookieRaw);
    writeLocal(PREFIX+key+STAMP_SUFFIX,String(now));
    writeLocal(PREFIX+key+BACKUP_SUFFIX,JSON.stringify({writtenAt:now,value:cookie}));
    return cookie;
  }
  if(backup&&typeof backup==='object'&&backup.value!=null)return backup.value;
  return fallback;
}

export function write(key,value){
  let raw;
  try{raw=JSON.stringify(value)}catch{return false}
  const now=Date.now();
  const primaryOk=writeLocal(PREFIX+key,raw);
  const stampOk=writeLocal(PREFIX+key+STAMP_SUFFIX,String(now));
  const backupOk=writeLocal(PREFIX+key+BACKUP_SUFFIX,JSON.stringify({writtenAt:now,value}));
  const cookieOk=writeCookie(key,raw);
  return (primaryOk&&stampOk)||backupOk||cookieOk;
}
