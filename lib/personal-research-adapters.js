import {createHash} from 'node:crypto';
import {normalizeMusicBrainz,normalizeSoundCloud} from './research.js';
import {queryHash} from './personal-research-plan.js';
import {musicBrainzIdentity,releaseInterval} from './music-identity.js';

const sha=s=>createHash('sha256').update(s).digest('hex').slice(0,24);
const clean=s=>typeof s==='string'?s.normalize('NFKC').trim().slice(0,240):'';
const safeUrl=(raw,host,path)=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname===host&&path.test(u.pathname)?u:null;}catch{return null;}};
export const bandcampUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^[a-z0-9-]+\.bandcamp\.com$/.test(u.hostname)&&/^\/(album|track)\/[a-z0-9-]+\/?$/.test(u.pathname)?u:null;}catch{return null;}};
export const mixcloudUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname==='www.mixcloud.com'&&/^\/[\w-]+\/[\w-]+\/?$/.test(u.pathname)?u:null;}catch{return null;}};

export function createRequestBudget({fetcher=fetch,maxRequests=10,deadlineMs=45000,now=Date.now}={}){
  let count=0;const started=now();
  return {get count(){return count;},async get(url,{host,path,headers={},type='json'}={}){
    const u=safeUrl(url,host,path);if(!u)throw Error('Untrusted source URL');
    if(count>=maxRequests||now()-started>=deadlineMs)throw Error('Research budget reached');
    count++;
    const response=await fetcher(u,{headers,redirect:'error',signal:AbortSignal.timeout(4500)});
    if(!response.ok)throw Error('Source HTTP '+response.status);
    const contentType=response.headers?.get?.('content-type');
    if(contentType&&!contentType.includes(type==='json'?'json':'html'))throw Error('Unexpected source content type');
    const body=await response.text();
    if(body.length>(type==='json'?1_000_000:2_000_000))throw Error('Source response too large');
    return type==='json'?JSON.parse(body):body;
  }};
}
function lead(sourceId,artist,title,url,now,extra={}){
  const identityKey=[artist,title].map(s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()).join('|');
  const id='research-'+sha(sourceId+'\0'+url+'\0'+identityKey);
  return {id,identityKey,artistName:artist,title,releaseDate:null,dateBasis:'lead',datePrecision:'unknown',label:null,
    evidence:[{sourceId,url,fields:['artistName','title'],checkedAt:now.toISOString(),claimType:'lead'}],
    destinations:[{kind:'metadata',url}],flags:['release_date_unverified'],reviewStatus:'needs_review',...extra};
}
export function normalizeBandcampSearchHit(hit,source,now){
  const page=bandcampUrl(hit?.url);
  if(!page||typeof hit.title!=='string')return null;
  // Indexed title is a discovery clue only. It cannot establish a release date.
  const pieces=hit.title.split(/\s+[|–]\s+/).map(clean);
  const title=pieces[0],artist=pieces[1];
  if(!title||!artist||/^bandcamp$/i.test(artist))return null;
  return lead(source.id,artist,title,page.href,now,{destinations:[{kind:'buy',url:page.href}]});
}
export function normalizeMixcloudShow(show,source,now){
  const url=mixcloudUrl(show?.url);if(!url)return [];
  const sections=Array.isArray(show.sections)?show.sections:[];
  const tracks=sections.filter(s=>clean(s.artist)&&clean(s.song)).slice(0,30);
  if(tracks.length)return tracks.map(s=>lead(source.id,clean(s.artist),clean(s.song),url.href,now));
  const artist=clean(show.user?.name||show.user?.username),title=clean(show.name);
  return artist&&title?[lead(source.id,artist,title,url.href,now,{flags:['show_only','release_date_unverified']})]:[];
}
const result=(candidates=[],coverage=[],requests=0)=>({candidates,coverage,requests});
export function normalizePersonalRecording(row,source,now,window){
  const interval=releaseInterval(row?.['first-release-date']);
  if(!interval||interval.to<window.from||interval.from>window.to)return null;
  const candidate=normalizeMusicBrainz({...row,'first-release-date':interval.from},source,now,interval);
  if(!candidate)return null;
  candidate.identity=musicBrainzIdentity(row);
  candidate.dateInterval=interval;
  candidate.releaseDate=interval.precision==='day'?interval.from:null;
  candidate.datePrecision=interval.precision;
  Object.assign(candidate.evidence[0],{claimType:'release',claimDate:candidate.releaseDate,
    claimPrecision:interval.precision,claimInterval:interval,recordingId:candidate.identity.recordingId});
  return candidate;
}
export async function runSourceAdapter(source,{plan,budget,now=new Date(),soundcloudToken,braveKey,throttleMs=1100,expandRelationships=false}={}){
  const candidates=[],coverage=[];let used=0;
  const queries=plan.queries.length?plan.queries:[{kind:'genre',term:'drum and bass'}];
  if(source.kind==='soundcloud-tracks'&&!soundcloudToken)return { ...result(),state:'access-blocked',reason:'credentials_required'};
  if(source.kind==='bandcamp-indexed'&&!braveKey)return { ...result(),state:'access-blocked',reason:'search_credential_required'};
  if(!source.enabled)return {...result(),state:'disabled'};
  const searchLimit=source.kind==='musicbrainz-recordings'&&expandRelationships?Math.max(1,source.maxRequests-1):source.maxRequests;
  for(const query of queries){
    if(used>=searchLimit||budget.count>=plan.maxRequests)break;
    const before=budget.count,part={queryHash:queryHash(source.id,query.term,plan.window),state:'complete',pages:0,matched:0,cursor:null};
    coverage.push(part);
    try{
      if(source.kind==='musicbrainz-recordings'){
        if(used&&throttleMs)await new Promise(resolve=>setTimeout(resolve,throttleMs));
        const url=new URL('https://musicbrainz.org/ws/2/recording/');
        const clause=query.kind==='artist'?`artist:"${query.term.replaceAll('"','')}"`:query.kind==='genre'?`tag:"${query.term.replaceAll('"','')}"`:`"${query.term.replaceAll('"','')}"`;
        url.searchParams.set('query',`${clause} AND firstreleasedate:[${plan.window.from} TO ${plan.window.to}]`);
        url.searchParams.set('fmt','json');url.searchParams.set('limit',String(source.maxItems));
        let offset=0;
        for(let page=0;page<(expandRelationships?1:2);page++){
          if(page&&throttleMs)await new Promise(resolve=>setTimeout(resolve,throttleMs));
          url.searchParams.set('offset',String(offset));
          const data=await budget.get(url,{host:'musicbrainz.org',path:/^\/ws\/2\/recording\/$/,headers:{'User-Agent':'DROP-PORTAL/3D (https://drop-portal-v1-0.vercel.app/)'}});
          if(!Array.isArray(data.recordings))throw Error('Malformed recording response');part.pages++;
          for(const row of data.recordings){const c=normalizePersonalRecording(row,source,now,plan.window);if(c){candidates.push(c);part.matched++;}}
          offset+=data.recordings.length;
          if(!data.recordings.length||!Number.isFinite(Number(data.count))||offset>=Number(data.count)){part.state='complete';part.cursor=null;break;}
          part.state='truncated';part.cursor=String(offset);
          if(used+budget.count-before>=searchLimit||budget.count>=plan.maxRequests)break;
        }
      }else if(source.kind==='soundcloud-tracks'){
        const url=new URL('https://api.soundcloud.com/tracks');url.searchParams.set('q',query.term);url.searchParams.set('access','playable');url.searchParams.set('linked_partitioning','true');url.searchParams.set('limit',String(source.maxItems));
        url.searchParams.set('created_at[from]',plan.window.from+' 00:00:00');url.searchParams.set('created_at[to]',plan.window.to+' 23:59:59');
        let next=url;
        for(let page=0;next&&page<2;page++){
          const data=await budget.get(next,{host:'api.soundcloud.com',path:/^\/tracks$/,headers:{Authorization:'OAuth '+soundcloudToken}});
          const rows=Array.isArray(data)?data:data.collection;if(!Array.isArray(rows))throw Error('Malformed tracks response');part.pages++;
          for(const row of rows){const c=normalizeSoundCloud(row,source,now,plan.window);if(c){c.datePrecision='unknown';c.evidence[0].claimType='upload';c.evidence[0].claimDate=c.uploadedAt;c.evidence[0].claimPrecision='day';candidates.push(c);part.matched++;}}
          next=data.next_href?safeUrl(data.next_href,'api.soundcloud.com',/^\/tracks$/):null;
          if(data.next_href&&!next)throw Error('Untrusted SoundCloud cursor');
          part.state=next?'truncated':'complete';part.cursor=next?next.href.slice(0,1000):null;
          if(used+budget.count-before>=searchLimit||budget.count>=plan.maxRequests)break;
        }
      }else if(source.kind==='mixcloud-shows'){
        const url=new URL('https://api.mixcloud.com/search/');url.searchParams.set('q',query.term);url.searchParams.set('type','cloudcast');url.searchParams.set('limit',String(source.maxItems));
        let next=url;
        for(let page=0;next&&page<2;page++){
          const data=await budget.get(next,{host:'api.mixcloud.com',path:/^\/search\/$/});
          if(!Array.isArray(data.data))throw Error('Malformed Mixcloud search');part.pages++;
          for(const show of data.data){const found=normalizeMixcloudShow(show,source,now);candidates.push(...found);part.matched+=found.length;}
          next=data.paging?.next?safeUrl(data.paging.next,'api.mixcloud.com',/^\/search\/$/):null;
          if(data.paging?.next&&!next)throw Error('Untrusted Mixcloud cursor');
          part.state=next?'truncated':'complete';part.cursor=next?next.href.slice(0,1000):null;
          if(used+budget.count-before>=searchLimit||budget.count>=plan.maxRequests)break;
        }
      }else if(source.kind==='bandcamp-indexed'){
        const url=new URL('https://api.search.brave.com/res/v1/web/search');url.searchParams.set('q',`site:bandcamp.com/album/ ${query.term} drum and bass`);url.searchParams.set('count',String(source.maxItems));
        const data=await budget.get(url,{host:'api.search.brave.com',path:/^\/res\/v1\/web\/search$/,headers:{'X-Subscription-Token':braveKey,Accept:'application/json'}});
        if(!Array.isArray(data.web?.results))throw Error('Malformed search response');part.pages++;
        for(const hit of data.web.results){const found=normalizeBandcampSearchHit(hit,source,now);if(found){candidates.push(found);part.matched++;}}
        if(data.web?.more_results){part.state='truncated';part.cursor='next_page';}
      }
    }catch(error){part.state='error';part.reason=String(error.message).slice(0,80);}
    used+=budget.count-before;
  }
  if(expandRelationships&&source.kind==='musicbrainz-recordings'&&used<source.maxRequests){
    const edition=candidates.flatMap(c=>c.identity?.editions||[])[0];
    if(edition){
      const before=budget.count,part={queryHash:queryHash(source.id,edition.id,plan.window),state:'complete',pages:0,matched:0,cursor:null};
      coverage.push(part);
      try{
        if(throttleMs)await new Promise(resolve=>setTimeout(resolve,throttleMs));
        const id=edition.id.slice(10);
        const data=await budget.get('https://musicbrainz.org/ws/2/release/'+id+'?inc=labels&fmt=json',
          {host:'musicbrainz.org',path:/^\/ws\/2\/release\/[a-f0-9-]{36}$/,headers:{'User-Agent':'DROP-PORTAL/3D (https://drop-portal-v1-0.vercel.app/)'}});
        if(data.id!==id||!Array.isArray(data['label-info']))throw Error('Malformed release relationship response');
        const labels=data['label-info'].filter(x=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x.label?.id||'')&&clean(x.label.name))
          .map(x=>({id:'mblabel:'+x.label.id.toLowerCase(),name:clean(x.label.name),sourceUrl:'https://musicbrainz.org/label/'+x.label.id.toLowerCase()}));
        for(const c of candidates)for(const e of c.identity?.editions||[])if(e.id===edition.id)e.labels=labels;
        part.pages=1;part.matched=labels.length;
      }catch(error){part.state='error';part.reason=String(error.message).slice(0,80);}
      used+=budget.count-before;
    }
  }
  return {candidates:[...new Map(candidates.map(c=>[c.id,c])).values()],coverage,requests:used,
    state:coverage.some(p=>p.state==='error')?'partial':coverage.some(p=>p.state==='truncated')?'truncated':'complete'};
}
