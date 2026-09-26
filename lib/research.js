import crypto from 'node:crypto';
import {validDate} from './contracts.js';
import {isSafeUrl} from './pipeline.js';
import {resolveSearchWindow,windowSlices,inWindow} from './research-window.js';

const TYPES=new Set(['musicbrainz-recordings','soundcloud-tracks']);
export const MAX_CANDIDATES=400;
const MAX_PAGES=2;
const dateOnly=value=>typeof value==='string'&&validDate(value.slice(0,10))?value.slice(0,10):null;
const slug=(source,key)=>crypto.createHash('sha256').update(source+'\0'+key).digest('hex').slice(0,24);
const clean=value=>typeof value==='string'?value.trim().slice(0,240):'';
const stableKey=(artist,title)=>[artist,title].map(s=>clean(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()).join('|');

export function validateRegistry(registry){
  if(registry?.schemaVersion!==1||!Array.isArray(registry.sources)||registry.sources.length>50)throw Error('Invalid research source registry');
  const ids=new Set();
  for(const s of registry.sources){
    if(!/^[a-z0-9-]{3,64}$/.test(s?.id||'')||ids.has(s.id)||!TYPES.has(s.kind)||
      typeof s.name!=='string'||s.name.length>100||typeof s.enabled!=='boolean'||
      !Array.isArray(s.queries)||!s.queries.length||s.queries.length>10||
      !s.queries.every(q=>typeof q==='string'&&q.length>=3&&q.length<=100)||
      !Number.isInteger(s.limitPerQuery)||s.limitPerQuery<1||s.limitPerQuery>50)throw Error('Invalid research source: '+String(s?.id));
    ids.add(s.id);
  }
  return registry;
}

export function normalizeMusicBrainz(record,source,now=new Date(),window=resolveSearchWindow('1mo',now)){
  const artist=clean(record['artist-credit']?.map(a=>typeof a==='string'?a:a.name||a.artist?.name||'').join('')||'');
  const title=clean(record.title),releaseDate=dateOnly(record['first-release-date']);
  if(!artist||!title||!releaseDate||!record.id)return null;
  if(!inWindow(releaseDate,window))return null;
  const url='https://musicbrainz.org/recording/'+record.id;
  if(!/^[a-f0-9-]{36}$/.test(record.id))return null;
  const release=clean(record.releases?.[0]?.title)||null;
  return {id:'research-'+slug(source.id,record.id),identityKey:stableKey(artist,title),artistName:artist,title,
    release,releaseDate,label:null,subgenre:null,dateBasis:'confirmed-release',searchWindows:[window],sourceIds:[source.id],providerIds:{musicbrainz:record.id},
    evidence:[{sourceId:source.id,url,fields:['artistName','title','releaseDate'],checkedAt:now.toISOString()}],
    destinations:[{kind:'metadata',url}],preview:null,reviewStatus:'needs_review',
    flags:['audio_not_assessed','store_link_needed','label_unverified'],discoveredAt:now.toISOString()};
}

export function normalizeSoundCloud(track,source,now=new Date(),window=resolveSearchWindow('1mo',now)){
  const artist=clean(track.metadata_artist||track.user?.username),title=clean(track.title);
  const url=track.permalink_url;
  const urn=typeof track.urn==='string'&&/^soundcloud:tracks:[0-9]+$/.test(track.urn)?track.urn:
    Number.isSafeInteger(track.id)?'soundcloud:tracks:'+track.id:null;
  if(!artist||!title||!urn||!isSafeUrl(url)||new URL(url).hostname!=='soundcloud.com'&&
    !new URL(url).hostname.endsWith('.soundcloud.com'))return null;
  // created_at is an upload timestamp; it must never masquerade as release date.
  const uploadedAt=dateOnly(track.created_at);
  if(!uploadedAt)return null;
  if(!inWindow(uploadedAt,window))return null;
  return {id:'research-'+slug(source.id,urn),identityKey:stableKey(artist,title),artistName:artist,title,
    release:null,releaseDate:null,uploadedAt,dateBasis:'upload-only',searchWindows:[window],label:null,subgenre:clean(track.genre)||null,
    sourceIds:[source.id],providerIds:{soundcloud:urn},reachCount:Number.isFinite(track.playback_count)?track.playback_count:null,
    evidence:[{sourceId:source.id,url,fields:['artistName','title','uploadedAt'],checkedAt:now.toISOString()}],
    destinations:[{kind:'listen',url}],preview:null,reviewStatus:'needs_review',
    flags:['release_date_unverified','store_link_needed','audio_not_assessed'],discoveredAt:now.toISOString()};
}

async function responseJson(fetcher,url,headers={}){
  const response=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Source request HTTP '+response.status);
  const body=await response.text();
  if(body.length>1_000_000)throw Error('Source response too large');
  return JSON.parse(body);
}

export async function discoverSource(source,{fetcher=fetch,now=new Date(),window=resolveSearchWindow('1mo',now),soundcloudToken=process.env.SOUNDCLOUD_ACCESS_TOKEN,throttleMs=1100}={}){
  if(source.kind==='soundcloud-tracks'&&!soundcloudToken)return {candidates:[],state:'needs_credentials',coverage:[]};
  const candidates=[],coverage=[];
  let mbRequests=0;
  for(const q of source.queries)for(const slice of windowSlices(window)){
    const part={query:q,...slice,pages:0,matched:0,basis:source.kind==='musicbrainz-recordings'?'release':'upload',state:'complete'};
    coverage.push(part);
    let offset=0,nextHref=null;
    try{
      for(let page=0;page<MAX_PAGES;page++){
        let url,headers={};
        if(source.kind==='musicbrainz-recordings'){
          if(mbRequests++&&throttleMs)await new Promise(resolve=>setTimeout(resolve,throttleMs));
          url=new URL('https://musicbrainz.org/ws/2/recording/');
          url.searchParams.set('query',`tag:"${q.replaceAll('"','')}" AND firstreleasedate:[${slice.from} TO ${slice.to}]`);
          url.searchParams.set('fmt','json');url.searchParams.set('limit',String(source.limitPerQuery));
          url.searchParams.set('offset',String(offset));
          headers={'User-Agent':'DROP-PORTAL/3B (https://drop-portal-v1-0.vercel.app/)'};
        }else{
          url=nextHref?new URL(nextHref):new URL('https://api.soundcloud.com/tracks');
          if(url.protocol!=='https:'||url.hostname!=='api.soundcloud.com'||url.pathname!=='/tracks'||url.username||url.password)
            throw Error('Untrusted SoundCloud pagination URL');
          if(!nextHref){
            url.searchParams.set('q',q);url.searchParams.set('access','playable');url.searchParams.set('limit',String(source.limitPerQuery));
            url.searchParams.set('created_at[from]',slice.from+' 00:00:00');
            url.searchParams.set('created_at[to]',slice.to+' 23:59:59');
            url.searchParams.set('linked_partitioning','true');
          }
          headers={Authorization:'OAuth '+soundcloudToken};
        }
        const data=await responseJson(fetcher,url,headers);
        const items=source.kind==='musicbrainz-recordings'?data.recordings:(Array.isArray(data)?data:data.collection);
        if(!Array.isArray(items))throw Error('Unexpected response from '+source.id);
        part.pages++;
        for(const item of items){
          const result=source.kind==='musicbrainz-recordings'?normalizeMusicBrainz(item,source,now,window):normalizeSoundCloud(item,source,now,window);
          if(result&&inWindow(result.releaseDate||result.uploadedAt,slice)){candidates.push(result);part.matched++;}
        }
        if(source.kind==='musicbrainz-recordings'){
          offset+=items.length;
          if(!items.length||Number.isFinite(data.count)&&offset>=data.count||items.length<source.limitPerQuery)break;
          if(page===MAX_PAGES-1)part.state='truncated';
        }else{
          nextHref=data.next_href||null;
          if(!nextHref)break;
          if(page===MAX_PAGES-1)part.state='truncated';
        }
      }
    }catch(error){part.state='error';part.message=String(error.message).slice(0,120);}
  }
  const state=coverage.some(c=>c.state==='error')?'partial':coverage.some(c=>c.state==='truncated')?'truncated':'ok';
  return {candidates:[...new Map(candidates.map(c=>[c.id,c])).values()],state,coverage};
}

export function mergeQueue(queue,results,now=new Date()){
  if(queue?.schemaVersion!==1||!Array.isArray(queue.candidates)||!Array.isArray(queue.runs))throw Error('Invalid research queue');
  const byId=new Map(queue.candidates.map(c=>[c.id,c]));
  const byIdentity=new Map(queue.candidates.filter(c=>c.identityKey).map(c=>[c.identityKey,c.id]));
  let added=0,matched=0;
  for(const incoming of results){
    if(!incoming.id||!incoming.identityKey||!Array.isArray(incoming.evidence))throw Error('Invalid research candidate');
    const id=byId.has(incoming.id)?incoming.id:byIdentity.get(incoming.identityKey);
    if(id){
      const prior=byId.get(id);matched++;
      // Preserve editorial decisions and known release dates. Add evidence, never downgrade it.
      prior.sourceIds=[...new Set([...prior.sourceIds,...incoming.sourceIds])];
      prior.providerIds={...prior.providerIds,...incoming.providerIds};
      prior.evidence=[...prior.evidence,...incoming.evidence.filter(e=>!prior.evidence.some(old=>old.url===e.url))];
      prior.destinations=[...prior.destinations,...incoming.destinations.filter(d=>!prior.destinations.some(old=>old.url===d.url))];
      if(!prior.releaseDate&&incoming.releaseDate)prior.releaseDate=incoming.releaseDate;
      if(!prior.release&&incoming.release)prior.release=incoming.release;
      if(prior.reachCount==null&&incoming.reachCount!=null)prior.reachCount=incoming.reachCount;
      prior.searchWindows=[...new Map([...(prior.searchWindows||[]),...(incoming.searchWindows||[])].map(w=>[JSON.stringify(w),w])).values()];
      if(prior.releaseDate)prior.dateBasis='confirmed-release';
      prior.flags=[...new Set([...prior.flags,...incoming.flags])].filter(f=>f!=='release_date_unverified'||!prior.releaseDate);
    }else{
      byId.set(incoming.id,structuredClone(incoming));byIdentity.set(incoming.identityKey,incoming.id);added++;
    }
  }
  // Rank before imposing the queue cap; otherwise the first query can crowd
  // out older candidates even when Discovery depth favors them.
  const candidates=[...byId.values()];
  return {queue:{...queue,updatedAt:now.toISOString(),candidates},added,matched};
}
