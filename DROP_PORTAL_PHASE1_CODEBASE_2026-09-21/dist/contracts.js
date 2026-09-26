export const TIMEZONE = 'America/Chicago';
export const WEEKDAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
export const PROFILE_KEYS = ['future','deep','jungle','depth','experimental','floor','darkness','breaks'];
export const SEARCH_PAST = ['1mo','3mo','6mo','1yr'];
export const validHour = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):00$/.test(value);
export function validDate(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(value+'T12:00:00Z');
  return !Number.isNaN(+instant) && instant.toISOString().slice(0,10) === value;
}
export const validProfile = p => !!p && PROFILE_KEYS.every(k=>Number.isFinite(p[k]) && p[k]>=0 && p[k]<=100) && Number.isInteger(p.count) && p.count>=10 && p.count<=15 && typeof p.mixes==='boolean' && (p.searchPast===undefined||SEARCH_PAST.includes(p.searchPast));
// Older saved profiles and published snapshots default to one month until edited.
export const cleanProfile = p => ({...Object.fromEntries([...PROFILE_KEYS,'count','mixes'].map(k=>[k,p[k]])),searchPast:p.searchPast??'1mo'});
export function validSchedule(s) {
  return !!s && s.schemaVersion===1 && s.timezone===TIMEZONE && WEEKDAYS.includes(s.defaultSchedule?.weekday) && validHour(s.defaultSchedule.time) && Number.isFinite(Date.parse(s.nextDropAt)) && ['armed','publishing','paused'].includes(s.status) && (s.override===null || (s.override?.mode==='one-off' && validDate(s.override.date) && validHour(s.override.time)));
}
export function validInquiry(i) {
  return !!i && i.schemaVersion===1 && validDate(i.targetDropDate) && validProfile(i.baseProfile) && (i.status==='base-only' && i.weeklyOverride===null || i.status==='queued' && validProfile(i.weeklyOverride));
}
export function zoneParts(value, zone=TIMEZONE) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function localDate(value, zone=TIMEZONE) {
  const p=zoneParts(value,zone); return `${p.year}-${p.month}-${p.day}`;
}
// Resolve wall time by checking candidate offsets. Nonexistent spring-forward
// hours are rejected; the earlier occurrence is chosen for repeated fall hours.
export function scheduleInstant(date,time) {
  if(!validDate(date)||!validHour(time)) throw new Error('Choose a valid date and whole-hour time.');
  const wall=Date.parse(date+'T'+time+':00Z');
  const matches=[];
  for(const offset of [-360,-300]) {
    const instant=new Date(wall-offset*60000), p=zoneParts(instant);
    if(`${p.year}-${p.month}-${p.day}`===date && `${p.hour}:${p.minute}`===time) matches.push(instant);
  }
  if(!matches.length) throw new Error('That local hour does not exist during the daylight-saving change. Choose another hour.');
  return new Date(Math.min(...matches.map(Number)));
}
export function nextWeekly(defaultSchedule, after=new Date()) {
  const start=localDate(after);
  for(let day=0;day<15;day++) {
    const date=new Date(Date.parse(start+'T12:00:00Z')+day*86400000);
    if(WEEKDAYS[date.getUTCDay()]!==defaultSchedule.weekday) continue;
    try { const next=scheduleInstant(date.toISOString().slice(0,10),defaultSchedule.time); if(next>after) return next; } catch { /* skip nonexistent local hour */ }
  }
  throw new Error('No future weekly occurrence found.');
}
