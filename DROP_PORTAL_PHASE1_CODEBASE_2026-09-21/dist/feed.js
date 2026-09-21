import{applyFeed}from'./data.js';

export const feedState={status:'idle',source:'seed',message:'Demo data',loadedAt:null};
const DEFAULT_MANIFEST='https://raw.githubusercontent.com/splntrAVdesigns/DROP-PORTAL-V1.0/main/weekly-feed/drops/index.json';

function validTrack(t){return t&&typeof t.id==='string'&&typeof t.artistName==='string'&&typeof t.title==='string'&&Number.isInteger(t.lane)&&t.lane>=0&&t.lane<=3&&Number.isFinite(t.score)&&Number.isFinite(t.confidence)}
function validDrop(d){return d&&typeof d.id==='string'&&Array.isArray(d.ids)&&d.ids.length>0&&typeof d.period==='string'}
function validMix(m){return m&&typeof m.id==='string'&&typeof m.artistName==='string'&&typeof m.title==='string'}
function validatePayload(p){
  if(!p||p.schemaVersion!==1||!validDrop(p.drop)||!Array.isArray(p.tracks))throw Error('Invalid DROP:PORTAL feed payload');
  const tracks=p.tracks.filter(validTrack),ids=new Set(tracks.map(t=>t.id));
  if(!p.drop.ids.every(id=>ids.has(id)))throw Error('Drop references missing tracks');
  return{drop:p.drop,tracks,mixes:Array.isArray(p.mixes)?p.mixes.filter(validMix):[]};
}
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Feed request failed '+r.status);return r.json()}
export async function loadWeeklyFeed(){
  feedState.status='loading';
  try{
    const manifest=await json(DEFAULT_MANIFEST);
    if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.drops)||!manifest.drops.length)throw Error('No published drops');
    const entries=[...manifest.drops].filter(x=>x&&x.status==='published'&&x.url).sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    if(!entries.length)throw Error('No published drops');
    const payloads=[];
    for(const entry of entries){try{payloads.push(validatePayload(await json(new URL(entry.url,DEFAULT_MANIFEST).href)))}catch(e){console.warn('[DROP:PORTAL] skipped invalid drop',entry.id,e)}}
    if(!payloads.length)throw Error('No valid published drops');
    applyFeed(payloads);
    feedState.status='ready';feedState.source='github';feedState.message='Live weekly feed';feedState.loadedAt=new Date().toISOString();
    return true;
  }catch(e){
    console.warn('[DROP:PORTAL] weekly feed unavailable; using bundled seed data',e);
    feedState.status='fallback';feedState.source='seed';feedState.message='Bundled demo fallback';feedState.loadedAt=new Date().toISOString();
    return false;
  }
}
