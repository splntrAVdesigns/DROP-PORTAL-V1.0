import{applyFeed}from'./data.js';

export const feedState={status:'idle',source:'seed',message:'Demo data',loadedAt:null,quality:null};
const LIVE_MANIFEST='https://raw.githubusercontent.com/splntrAVdesigns/DROP-PORTAL-V1.0/main/weekly-feed/drops/index.json';
const DEPLOYED_MANIFEST='/weekly-feed/drops/index.json';

function httpsUrl(value){try{return new URL(value).protocol==='https:'}catch{return false}}
function validLink(link){return link&&typeof link.kind==='string'&&httpsUrl(link.url)}
function validPreview(preview){
  if(preview==null)return true;
  if(!preview||typeof preview!=='object'||typeof preview.provider!=='string')return false;
  if(preview.kind==='direct-audio')return(typeof preview.previewUrl==='string'&&(preview.previewUrl.startsWith('/')||httpsUrl(preview.previewUrl)))&&typeof preview.usageBasis==='string';
  if(preview.kind==='provider-embed')return httpsUrl(preview.embedUrl);
  return false;
}
function validTrack(t){return t&&typeof t.id==='string'&&typeof t.artistName==='string'&&typeof t.title==='string'&&typeof t.reason==='string'&&typeof t.subgenre==='string'&&typeof t.release==='string'&&typeof t.label==='string'&&typeof t.releaseDate==='string'&&Number.isInteger(t.lane)&&t.lane>=0&&t.lane<=3&&Number.isFinite(t.score)&&Number.isFinite(t.confidence)&&Array.isArray(t.links)&&t.links.length>0&&t.links.every(validLink)&&validPreview(t.preview)}
function validDrop(d){return d&&typeof d.id==='string'&&Array.isArray(d.ids)&&d.ids.length>0&&typeof d.period==='string'}
function validMix(m){return m&&typeof m.id==='string'&&typeof m.artistName==='string'&&typeof m.title==='string'&&Array.isArray(m.links)&&m.links.length>0&&m.links.every(validLink)&&validPreview(m.preview)}
function validProfileSnapshot(s){const numeric=['future','deep','jungle','depth','experimental','floor','darkness','breaks','count'];return s&&typeof s==='object'&&numeric.every(k=>Number.isFinite(s[k]))&&typeof s.mixes==='boolean'}
function validatePayload(p){
  if(!p||p.schemaVersion!==1||!validDrop(p.drop)||!Array.isArray(p.tracks))throw Error('Invalid DROP:PORTAL feed payload');
  if(!p.tracks.every(validTrack))throw Error('Published tracks failed the enrichment gate');
  if(Array.isArray(p.mixes)&&!p.mixes.every(validMix))throw Error('Published mixes failed the destination gate');
  const tracks=p.tracks.map(t=>({...t,links:t.links.map(link=>({...link}))})),ids=new Set(tracks.map(t=>t.id));
  if(!p.drop.ids.every(id=>ids.has(id)))throw Error('Drop references missing tracks');
  return{drop:p.drop,tracks,mixes:Array.isArray(p.mixes)?p.mixes.map(m=>({...m,links:m.links.map(link=>({...link}))})):[],profileSnapshot:validProfileSnapshot(p.profileSnapshot)?{...p.profileSnapshot}:null};
}
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Feed request failed '+r.status);return r.json()}
async function loadManifest(url){
  const manifest=await json(url);
  if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.drops)||!manifest.drops.length)throw Error('No published drops');
  return{manifest,url};
}
export async function loadWeeklyFeed(){
  feedState.status='loading';
  try{
    let resolved;
    try{resolved=await loadManifest(LIVE_MANIFEST+'?v='+Date.now())}
    catch(remoteError){console.warn('[DROP:PORTAL] live manifest unavailable; using deployed snapshot',remoteError);resolved=await loadManifest(DEPLOYED_MANIFEST)}
    const{manifest,url:manifestUrl}=resolved;
    const manifestBase=new URL(manifestUrl,globalThis.location?.origin||'http://localhost').href;
    const entries=[...manifest.drops].filter(x=>x&&x.status==='published'&&x.url).sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    if(!entries.length)throw Error('No published drops');
    const payloads=[];
    for(const entry of entries){try{payloads.push(validatePayload(await json(new URL(entry.url,manifestBase).href)))}catch(e){console.warn('[DROP:PORTAL] skipped invalid drop',entry.id,e)}}
    if(!payloads.length)throw Error('No valid published drops');
    applyFeed(payloads);
    const current=payloads[0],withPreview=current.tracks.filter(t=>t.preview).length,withDestinations=current.tracks.filter(t=>t.links.length).length;
    feedState.status='ready';feedState.source='github';feedState.message=manifestUrl.startsWith('http')?'Live weekly feed':'Deployed feed snapshot';feedState.loadedAt=new Date().toISOString();feedState.quality={tracks:current.tracks.length,withPreview,withDestinations,mixes:current.mixes.length};
    return true;
  }catch(e){
    console.warn('[DROP:PORTAL] weekly feed unavailable; using bundled seed data',e);
    feedState.status='fallback';feedState.source='seed';feedState.message='Bundled demo fallback';feedState.loadedAt=new Date().toISOString();feedState.quality=null;
    return false;
  }
}
