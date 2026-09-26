import {validInquiry,validSchedule,validDate,localDate,nextWeekly} from './contracts.js';

const META_FIELDS=['artistName','title','release','label','releaseDate','subgenre','reason'];
const PROFILE_FIELDS=['future','deep','jungle','depth','experimental','floor','darkness','breaks','count','mixes'];
const OFFICIAL=['bandcamp.com','soundcloud.com','musicbrainz.org','discogs.com','beatport.com','juno.co.uk','junodownload.com','mixcloud.com','apple.com'];
function assert(condition,message){if(!condition)throw new Error(message);}
export function localOccurrence(schedule){
  assert(validSchedule(schedule),'Invalid current schedule');
  return localDate(schedule.nextDropAt,schedule.timezone);
}
export function effectiveProfile(schedule,inquiry){
  assert(validSchedule(schedule)&&validInquiry(inquiry),'Invalid current publisher state');
  const date=localOccurrence(schedule);
  const override=inquiry.status==='queued'&&inquiry.targetDropDate===date&&inquiry.weeklyOverride;
  return {source:override?'weeklyOverride':'baseProfile',targetDropDate:date,...(override?inquiry.weeklyOverride:inquiry.baseProfile)};
}
export function captureOccurrence(schedule,inquiry){
  const profile=effectiveProfile(schedule,inquiry);
  assert(typeof inquiry.updatedAt==='string','Inquiry revision timestamp missing');
  return {nextDropAt:schedule.nextDropAt,inquiryUpdatedAt:inquiry.updatedAt,profile};
}
export function stagePath(date){assert(validDate(date),'Unsafe stage date');return 'ops/staged/'+date+'.json';}
export function payloadPath(date){assert(validDate(date),'Unsafe drop date');return 'weekly-feed/drops/'+date+'.json';}
export function isOfficialUrl(value){
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port &&
      OFFICIAL.some(host=>u.hostname===host||u.hostname.endsWith('.'+host));
  }catch{return false;}
}
export function isSafeUrl(value){
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
    const host=u.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.internal')||host==='127.0.0.1'||host==='0.0.0.0'||host==='::1'||/^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(host))return false;
    return host.includes('.');
  }catch{return false;}
}
function previewOkay(preview){
  if(preview===null)return true;
  if(!preview||preview.kind!=='provider-embed'||typeof preview.provider!=='string'||!isOfficialUrl(preview.embedUrl))return false;
  const u=new URL(preview.embedUrl),host=u.hostname;
  return host==='bandcamp.com'&&u.pathname.startsWith('/EmbeddedPlayer/')||
    host==='w.soundcloud.com'&&u.pathname.startsWith('/player/')||
    host==='www.mixcloud.com'&&u.pathname.startsWith('/widget/');
}
function linksOkay(links){return Array.isArray(links)&&links.length>0&&links.every(l=>l&&typeof l.kind==='string'&&isSafeUrl(l.url));}
function assertEvidence(candidate,track){
  const evidence=candidate.evidence?.[track.id];
  assert(evidence&&isOfficialUrl(evidence.sourceUrl),track.id+': verified official evidence URL required');
  // Provenance is a supplied claim, not proof the remote metadata is correct.
  assert(evidence.fields?.includes('artistName')&&evidence.fields?.includes('title')&&evidence.fields?.includes('releaseDate'),
    track.id+': source must attest artist/title/release date');
  assert(track.links.some(l=>l.url===evidence.sourceUrl)||candidate.sources?.includes(evidence.sourceUrl),
    track.id+': evidence source missing from public destinations');
}
export function validateCandidate(candidate,{schedule,inquiry,manifest,archive=[]}){
  const captured=captureOccurrence(schedule,inquiry),profile=captured.profile;
  assert(candidate&&typeof candidate==='object'&&JSON.stringify(candidate).length<=175000,'Candidate missing or too large');
  assert(Array.isArray(candidate.tracks)&&candidate.tracks.length===profile.count,'Candidate must contain exactly '+profile.count+' tracks');
  assert(Array.isArray(candidate.mixes)&&candidate.mixes.length<=(profile.mixes?2:0),'DJ mix count exceeds Tuner settings');
  assert(Array.isArray(candidate.sources)&&candidate.sources.every(isSafeUrl),'Invalid candidate source URLs');
  assert(candidate.evidence&&typeof candidate.evidence==='object','Per-track provenance is required');
  assert(manifest&&manifest.schemaVersion===1&&Array.isArray(manifest.drops),'Invalid publication manifest');
  const seen=new Set(archive.flatMap(p=>Array.isArray(p?.tracks)?p.tracks.map(t=>t.id):[]));
  const ids=new Set(),top=[];
  for(const track of candidate.tracks){
    assert(track&&typeof track.id==='string'&&/^[a-z0-9][a-z0-9-]{2,90}$/.test(track.id), 'Invalid track ID');
    assert(!ids.has(track.id),track.id+': duplicate candidate track');
    assert(!seen.has(track.id),track.id+': recently published track cannot repeat');
    ids.add(track.id);
    for(const f of META_FIELDS)assert(typeof track[f]==='string'&&track[f].trim(),track.id+': missing '+f);
    assert(validDate(track.releaseDate),track.id+': invalid releaseDate');
    assert(Number.isInteger(track.lane)&&track.lane>=0&&track.lane<=3,track.id+': invalid lane');
    assert(Number.isFinite(track.score)&&track.score>=0&&track.score<=100,track.id+': invalid score');
    assert(Number.isFinite(track.confidence)&&track.confidence>=0&&track.confidence<=100,track.id+': invalid confidence');
    assert(linksOkay(track.links),track.id+': HTTPS listening/store destination required');
    assert(previewOkay(track.preview),track.id+': unverified or unsupported provider preview');
    assertEvidence(candidate,track);
    if(track.startHere===true)top.push(track.id);
  }
  assert(top.length===3,'Exactly three Top 3 selections required');
  for(const mix of candidate.mixes){
    assert(mix&&typeof mix.id==='string'&&typeof mix.artistName==='string'&&typeof mix.title==='string','Invalid DJ mix');
    assert(linksOkay(mix.links)&&previewOkay(mix.preview??null),'Invalid DJ mix link/preview');
  }
  // The candidate is JSON-only, never carry through arbitrary request fields.
  return {
    tracks:candidate.tracks.map(t=>structuredClone(t)),
    mixes:candidate.mixes.map(m=>structuredClone(m)),
    sources:[...new Set(candidate.sources)],
    evidence:structuredClone(candidate.evidence)
  };
}
export function createStage(candidate,{schedule,inquiry,manifest,archive},clock=new Date()){
  const clean=validateCandidate(candidate,{schedule,inquiry,manifest,archive});
  return {
    schemaVersion:1,stageVersion:1,status:'validated',
    stagedAt:clock.toISOString(),captured:captureOccurrence(schedule,inquiry),
    verification:{kind:'metadata-source-attested',note:'Official links and schema checked; source attestation does not certify actual audio playback.'},
    candidate:clean
  };
}
export function validateStage(stage,{schedule,inquiry,manifest,archive=[]}){
  assert(stage?.schemaVersion===1&&stage.stageVersion===1&&stage.status==='validated','Invalid stage contract');
  const now=captureOccurrence(schedule,inquiry);
  assert(Date.parse(stage.captured?.nextDropAt)===Date.parse(now.nextDropAt),'Stage obsolete: schedule changed');
  assert(stage.captured.inquiryUpdatedAt===now.inquiryUpdatedAt,'Stage obsolete: Tuner preferences changed');
  assert(JSON.stringify(stage.captured.profile)===JSON.stringify(now.profile),'Stage obsolete: effective profile changed');
  const clean=validateCandidate(stage.candidate,{schedule,inquiry,manifest,archive});
  return {captured:now,candidate:clean};
}
export function makePublication(stage,{schedule,inquiry,manifest,archive=[]},publishedAt=new Date()){
  const {captured,candidate}=validateStage(stage,{schedule,inquiry,manifest,archive});
  const date=captured.profile.targetDropDate;
  assert(publishedAt.getTime()>=Date.parse(schedule.nextDropAt),'Drop not due yet');
  assert(!manifest.drops.some(d=>d.url==='./'+date+'.json'),'Production payload already published for this date');
  const used=new Set(manifest.drops.map(d=>d.id));
  let seq=Math.max(0,...manifest.drops.map(d=>/^\d+$/.test(d.id)?Number(d.id):0))+1;
  let id=String(seq).padStart(3,'0');while(used.has(id)){seq++;id=String(seq).padStart(3,'0')}
  const pubtime=publishedAt.toISOString();
  const payload={
    schemaVersion:1,
    drop:{id,sequenceNumber:seq,period:date+' · '+(schedule.override?'ONE-OFF':'WEEKLY'),ids:candidate.tracks.map(t=>t.id),publishedAt:pubtime},
    profileSnapshot:captured.profile,
    scheduleSnapshot:{nextDropAt:schedule.nextDropAt,timezone:schedule.timezone,defaultSchedule:schedule.defaultSchedule,override:schedule.override},
    tracks:candidate.tracks,mixes:candidate.mixes,sources:candidate.sources
  };
  const index={
    ...manifest,updatedAt:pubtime,
    drops:[{id,publishedAt:pubtime,status:'published',url:'./'+date+'.json'},...manifest.drops]
  };
  const upcoming=nextWeekly(schedule.defaultSchedule,new Date(publishedAt.getTime()+1000));
  const rolledSchedule={
    ...schedule,override:null,nextDropAt:upcoming.toISOString(),
    status:'armed',lastPublishedAt:pubtime,updatedAt:pubtime
  };
  const rolledInquiry={
    ...inquiry,targetDropDate:localDate(upcoming),updatedAt:pubtime,
    weeklyOverride:null,status:'base-only'
  };
  return {payload,index,rolledSchedule,rolledInquiry,date,id};
}
