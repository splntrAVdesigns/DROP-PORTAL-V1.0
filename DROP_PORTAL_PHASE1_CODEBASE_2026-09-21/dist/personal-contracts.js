import {validProfile,cleanProfile,validDate,localDate} from './contracts.js';
export const PERSONAL_DEFAULTS={future:35,deep:40,jungle:25,depth:80,experimental:65,floor:60,darkness:75,breaks:70,count:12,mixes:true,searchPast:'1mo',artists:[],labels:[],focus:{mode:'recent',decade:null,labelSpecific:false,flags:[]}};
export const FOCUS_FLAGS=['anthem','groove','deep-dig'];
export const entityKey=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
export function cleanNames(value){
  if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||!v.trim()||v.length>100||/[\u0000-\u001f<>]/.test(v)))throw Error('Use up to 20 artist or label names, each under 100 characters.');
  return [...new Map(value.map(v=>[entityKey(v),v.normalize('NFKC').trim().replace(/\s+/g,' ')])).values()];
}
export function cleanPersonalProfile(p){
  if(!validProfile(p))throw Error('Invalid taste profile.');
  const artists=cleanNames(p.artists||[]),labels=cleanNames(p.labels||[]),f=p.focus||PERSONAL_DEFAULTS.focus;
  if(!['recent','archives','future'].includes(f.mode)||typeof f.labelSpecific!=='boolean'||!Array.isArray(f.flags)||f.flags.length>3||f.flags.some(v=>!FOCUS_FLAGS.includes(v)))throw Error('Invalid discovery focus.');
  if(f.mode==='archives'&&(!Number.isInteger(f.decade)||f.decade<1980||f.decade>2020||f.decade%10))throw Error('Choose a supported decade.');
  if(f.labelSpecific&&!labels.length)throw Error('Add at least one label before enabling Label Specific.');
  return {...cleanProfile(p),artists,labels,focus:{mode:f.mode,decade:f.mode==='archives'?f.decade:null,labelSpecific:f.labelSpecific,flags:FOCUS_FLAGS.filter(v=>f.flags.includes(v))}};
}
export function effectivePersonalProfile(state,date){
  if(!validDate(date))throw Error('Invalid target date.');
  return cleanPersonalProfile(state.weekly_profile&&state.target_date===date?state.weekly_profile:state.base_profile);
}
export function personalSearchRequest(state,date,now=new Date()){
  const p=effectivePersonalProfile(state,date);
  const modeReady=p.focus.mode==='recent';
  return {schemaVersion:1,targetDate:date,profileRevision:state.revision,
    scope:state.weekly_profile&&state.target_date===date?'weekly':'base',
    timeframe:{mode:p.focus.mode,duration:p.focus.mode==='recent'?p.searchPast:null,decade:p.focus.decade,asOf:localDate(now)},
    preferredArtists:p.artists.map(name=>({name,identityStatus:'unresolved'})),
    preferredLabels:p.labels.map(name=>({name,identityStatus:'unresolved'})),
    constraints:{labelsOnly:p.focus.labelSpecific,requireVerifiedReleaseDate:true},
    intent:p.focus.flags,depth:p.focus.flags.includes('deep-dig')?Math.max(80,p.depth):p.depth,
    profile:p,previewPriority:true,learningEnabled:state.learning_enabled,
    execution:{ready:false,reason:modeReady?'Personal research selection connects in Phase 3C.3.':'This source coverage is not validated yet.'}};
}
export function feedbackMeaning(kind,value){
  if(kind==='saved')return value?'positive':'withdrawn';
  return 'neutral'; // Heard, hidden and absence of a save are not dislikes.
}
