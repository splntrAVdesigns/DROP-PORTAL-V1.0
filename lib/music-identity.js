import {createHash} from 'node:crypto';
import {validDate} from './contracts.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const text=value=>typeof value==='string'?value.normalize('NFKC').trim().slice(0,240):'';
export const evidenceId=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Imprecise historical dates are intervals, never invented January 1 release dates.
export function releaseInterval(value){
  if(typeof value!=='string')return null;
  if(validDate(value))return {from:value,to:value,precision:'day'};
  if(/^\d{4}-\d{2}$/.test(value)&&validDate(value+'-01')){
    const [year,month]=value.split('-').map(Number);
    const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    return {from:value+'-01',to:end,precision:'month'};
  }
  if(/^\d{4}$/.test(value)&&validDate(value+'-01-01'))return {from:value+'-01-01',to:value+'-12-31',precision:'year'};
  return null;
}
export const intervalInWindow=(interval,window)=>!!interval&&interval.from>=window.from&&interval.to<=window.to;

export function safeEvidenceUrl(value){
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return null;
    const host=u.hostname;
    if(!['musicbrainz.org','soundcloud.com','www.mixcloud.com'].includes(host)&&!(/^[a-z0-9-]+\.bandcamp\.com$/).test(host))return null;
    return u.href;
  }catch{return null;}
}

export function musicBrainzIdentity(row){
  if(!uuid.test(row?.id||''))return null;
  const artists=(row['artist-credit']||[]).filter(a=>uuid.test(a?.artist?.id||''))
    .map(a=>({id:'mbartist:'+a.artist.id.toLowerCase(),name:text(a.artist.name||a.name),creditedName:text(a.name||a.artist.name)}));
  const editions=(row.releases||[]).filter(r=>uuid.test(r?.id||''))
    .map(r=>({id:'mbrelease:'+r.id.toLowerCase(),title:text(r.title),date:releaseInterval(r.date),sourceUrl:'https://musicbrainz.org/release/'+r.id.toLowerCase()}));
  return {status:'resolved',recordingId:'mbrecording:'+row.id.toLowerCase(),provider:'musicbrainz',
    providerId:row.id.toLowerCase(),artists,editions,sourceUrl:'https://musicbrainz.org/recording/'+row.id.toLowerCase()};
}

// Source-scoped IDs are retained for leads. Names are not evidence of shared identity.
export function candidateIdentity(candidate){
  const id=candidate.identity;
  if(id?.status==='resolved'&&id.provider==='musicbrainz'&&uuid.test(id.providerId||'')&&
    id.recordingId==='mbrecording:'+id.providerId.toLowerCase()&&
    candidate.evidence?.some(e=>e.url==='https://musicbrainz.org/recording/'+id.providerId.toLowerCase()))return id;
  return {status:'unresolved',recordingId:null,sourceCandidateId:candidate.id};
}

export function verifiedDestinations(candidate){
  const identity=candidateIdentity(candidate);
  if(identity.status!=='resolved')return [];
  return (candidate.destinations||[]).filter(d=>['buy','listen'].includes(d.kind)&&safeEvidenceUrl(d.url)&&
    candidate.evidence?.some(e=>e.claimType==='release-page'&&e.url===d.url&&e.recordingId===identity.recordingId&&
      e.verification==='verified'&&Number.isFinite(Date.parse(e.checkedAt))));
}
