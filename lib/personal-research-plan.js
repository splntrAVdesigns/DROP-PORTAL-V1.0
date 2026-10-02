import {createHash} from 'node:crypto';
import {cleanPersonalProfile} from './personal-contracts.js';
import {resolveSearchWindow} from './research-window.js';

const clean=s=>String(s||'').normalize('NFKC').replace(/[\x00-\x1f]/g,' ').trim().slice(0,70);
export const queryHash=(sourceId,query,window)=>createHash('sha256').update([sourceId,query,window.from,window.to].join('\0')).digest('hex');
export function planPersonalResearch(input,scheduledAt=new Date()){
  const profile=cleanPersonalProfile(input);
  const window=resolveSearchWindow(profile.searchPast,scheduledAt);
  const queries=[],seen=new Set();
  const add=(kind,value)=>{const term=clean(value);const key=term.toLowerCase();if(term.length<3||seen.has(key)||queries.length>=6)return;seen.add(key);queries.push({kind,term});};
  for(const artist of profile.artists.slice(0,2))add('artist',artist);
  for(const label of profile.labels.slice(0,2))add('label',label);
  const lanes=[['future','experimental drum and bass'],['deep','deep minimal drum and bass'],['jungle','jungle breaks drum and bass']].sort((a,b)=>profile[b[0]]-profile[a[0]]);
  for(const [,term] of lanes)add('genre',term);
  return {window,queries:queries.slice(0,6),maxRequests:10,deadlineMs:35000};
}
export function validatePersonalSources(config){
  const kinds=new Set(['musicbrainz-recordings','soundcloud-tracks','mixcloud-shows','bandcamp-indexed','partner-store']);
  if(config?.schemaVersion!==1||!Array.isArray(config.sources)||config.sources.length>12)throw Error('Invalid personal source registry');
  const seen=new Set();
  for(const s of config.sources){
    if(!/^[a-z0-9-]{3,60}$/.test(s?.id||'')||seen.has(s.id)||!kinds.has(s.kind)||
      typeof s.enabled!=='boolean'||!['disabled','access-blocked','ready'].includes(s.initialStatus)||
      !Number.isInteger(s.maxRequests)||s.maxRequests<0||s.maxRequests>4||
      !Number.isInteger(s.maxItems)||s.maxItems<0||s.maxItems>50||
      (!s.enabled&&(s.initialStatus!=='disabled'||s.maxRequests!==0))||s.initialStatus==='ready')throw Error('Invalid personal source: '+s?.id);
    seen.add(s.id);
  }
  return config;
}
