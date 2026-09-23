export const lanes=['Future / Experimental','Deep / Minimal / Techy','Jungle / Breaks / Leftfield','Wildcard'];
const names=[['PHASE STUDIES','Negative Space','Elastic percussion, fractured rhythm, and room for the sub.'],['LOW FREQUENCY UNIT','Below the Surface','A stripped-back roller with weight in all the right places.'],['BREAK RESEARCH','Loose Coordinates','Restless breaks meet a hazy, late-night atmosphere.'],['PHASE STUDIES','Parallel Motion','Off-grid detail with a steady dancefloor pulse.'],['SIGNAL EXPERIMENT','Glass Circuit','Sharp drum edits and an unusual, spacious texture.'],['LOW FREQUENCY UNIT','Pressure System','Minimal movement; maximum low-end presence.'],['SUB STUDIES','After Hours','Deep, patient rhythm built for the late session.'],['BREAK RESEARCH','Return to Source','Rolling breaks with a warm, rough-edged character.'],['LOOP THEORY','Side Channel','A playful rhythmic detour for adventurous selections.'],['SIGNAL EXPERIMENT','Unmapped','A slower, atmospheric reset between heavier cuts.'],['SUB STUDIES','Residual','A restrained bass study for focused listening.'],['LOOP THEORY','Open Grid','Loose drum programming with room to breathe.']];
export const tracks=names.map(([artistName,title,reason],i)=>({id:'t'+i,artistName,title,reason,lane:[0,1,2,0,0,1,1,2,2,3,1,2][i],score:[94,92,93,89,91,90,88,92,87,86,89,90][i],confidence:[96,95,94,91,89,95,93,96,88,86,92,91][i],bpm:[172,174,168,172,170,174,172,168,170,140,174,168][i],demo:true,preview:i<3?{provider:'DROP:PORTAL original synthesis',kind:'direct-audio',previewUrl:'/audio/study-'+i+'.wav',waveformPeaksUrl:'/audio/study-'+i+'.json',durationSec:16,usageBasis:'owned',attribution:'Original synthesized prototype audio. Not a commercial release.'}:null,links:[],scores:{production:88+i%6,originality:85+i%9,dancefloor:82+i%12,headphones:91-i%5}}));
export const drops=[{id:'001',sequenceNumber:1,period:'21 — 27 SEP 2026',ids:tracks.slice(0,10).map(t=>t.id)},{id:'000',sequenceNumber:0,period:'14 — 20 SEP 2026',ids:['t10','t11','t0','t1','t2']}];
export const mixes=[{id:'m0',title:'The after-hours session',artistName:'PORTAL SELECTS',reason:'Deep textures → rolling breaks · illustrative mix entry',demo:true}];
export const defaults={scope:'base',future:35,deep:40,jungle:25,depth:80,experimental:65,floor:60,darkness:75,breaks:70,count:12,mixes:true};
export const feedProfiles=new Map();
export const feedMixes=new Map();
export function getDropMixes(dropId){return feedMixes.get(dropId)||[];}
export function getFeedProfile(dropId){return feedProfiles.get(dropId)||null}

export function applyFeed(payloads){
  if(!Array.isArray(payloads)||!payloads.length)return false;
  const liveTracks=[],liveMixes=[],liveDrops=[];feedProfiles.clear();feedMixes.clear();
  for(const p of payloads){
    for(const t of p.tracks||[])if(!liveTracks.some(x=>x.id===t.id))liveTracks.push(t);
    for(const m of p.mixes||[])if(!liveMixes.some(x=>x.id===m.id))liveMixes.push(m);
    if(p.profileSnapshot)feedProfiles.set(p.drop.id,{...p.profileSnapshot});
    feedMixes.set(p.drop.id,(p.mixes||[]).map(m=>({...m})));
    liveDrops.push(p.drop);
  }
  tracks.splice(0,tracks.length,...liveTracks);
  mixes.splice(0,mixes.length,...liveMixes);
  drops.splice(0,drops.length,...liveDrops);
  return true;
}
