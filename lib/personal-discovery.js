import {createHash} from 'node:crypto';
import {localDate,nextWeekly,validDate,scheduleInstant,WEEKDAYS} from './contracts.js';
import {cleanPersonalProfile,effectivePersonalProfile,PERSONAL_DEFAULTS} from './personal-contracts.js';

export function nextPersonalOccurrence(weekday,time,after=new Date()){
  if(!Number.isInteger(weekday)||weekday<0||weekday>6||!/^([01]\d|2[0-3]):00$/.test(time))throw Error('Choose a weekday and a whole-hour time.');
  return nextWeekly({weekday:WEEKDAYS[weekday],time},after);
}
export function planSnapshot(state,weekday,time,now=new Date()){
  const next=nextPersonalOccurrence(weekday,time,now);
  return {weekday,time,nextDropAt:next.toISOString(),profile:effectivePersonalProfile(state,localDate(next))};
}
export function oneTimeInstant(date,time,now=new Date()){
  if(!validDate(date))throw Error('Choose a date.');
  const at=scheduleInstant(date,time);
  if(+at<+now-60000||+at>+now+30*86400000)throw Error('Choose a time within the next 30 days.');
  return at;
}

// The first personal worker curates from already verified published releases.
// It never relabels a recording as a newly discovered release or invents audio facts.
export function curatePersonalDrop(payloads,profileInput,feedback=[],scheduledAt=new Date()){
  const profile=cleanPersonalProfile(profileInput||PERSONAL_DEFAULTS);
  const asOf=new Date(scheduledAt),months={"1mo":1,"3mo":3,"6mo":6,"1yr":12};
  const from=new Date(asOf);from.setUTCMonth(from.getUTCMonth()-months[profile.searchPast]);
  const key=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
  const artists=new Set(profile.artists.map(key)),labels=new Set(profile.labels.map(key));
  const feedbackMap=new Map(feedback.map(row=>[row.track_id+':'+row.kind,row.value]));
  const unique=new Map();
  for(const payload of payloads)for(const t of payload.tracks||[]){
    const date=Date.parse(String(t.releaseDate||'')+'T00:00:00Z');
    if(!t.id||!t.artistName||!t.title||!Number.isFinite(date)||date<+from||date>+asOf)continue;
    if(!Array.isArray(t.links)||!t.links.length||feedbackMap.get(t.id+':hidden'))continue;
    if(profile.focus.labelSpecific&&!labels.has(key(t.label)))continue;
    const lanePriority=[profile.future,profile.deep,profile.jungle,30][t.lane]||0;
    const score=lanePriority*.35+(Number(t.score)||0)*.18+
      (artists.has(key(t.artistName))?24:0)+(labels.has(key(t.label))?18:0)+
      (profile.focus.flags.includes('deep-dig')&&t.lane===1?8:0)-
      (feedbackMap.get(t.id+':heard')?12:0)-(feedbackMap.get(t.id+':saved')?18:0);
    const tie=parseInt(createHash('sha256').update(t.id+localDate(asOf)).digest('hex').slice(0,8),16)/0xffffffff;
    const existing=unique.get(key(t.artistName)+'|'+key(t.title));
    if(!existing||score>existing.score)unique.set(key(t.artistName)+'|'+key(t.title),{track:t,score,tie});
  }
  const ranked=[...unique.values()].sort((a,b)=>b.score-a.score||b.tie-a.tie);
  if(ranked.length<profile.count)return {status:'needs_research',detail:`Only ${ranked.length} verified catalog tracks match this taste and release window; ${profile.count} requested.`,available:ranked.length};
  const tracks=ranked.slice(0,profile.count).map((item,i)=>({...item.track,personalReason:
    artists.has(key(item.track.artistName))?'Preferred artist':labels.has(key(item.track.label))?'Preferred label':
    ['Future lane match','Deep lane match','Jungle lane match','Discovery match'][item.track.lane]||'Discovery match',personalRank:i+1}));
  return {status:'ready',result:{schemaVersion:1,source:'verified-published-catalog',
    label:'Your Dig',createdAt:new Date().toISOString(),scheduledAt:asOf.toISOString(),
    profileSnapshot:profile,tracks,topThree:tracks.slice(0,3).map(t=>t.id),
    note:'Selected from verified previously published DROP:PORTAL releases. This is a personal selection, not a new-release claim.'}};
}
