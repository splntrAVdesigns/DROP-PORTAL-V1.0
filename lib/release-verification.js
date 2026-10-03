import {safeEvidenceUrl} from './music-identity.js';

const MB = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = {accept: 'application/json', 'user-agent': 'DROP-PORTAL/3D.3C (release verification)'};

function clean(value='') {
  return String(value).toLowerCase().replace(/\\s+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function titleMatch(a,b) {
  const x=clean(a), y=clean(b);
  return x===y || x.includes(y) || y.includes(x);
}
function artistNames(candidate) {
  return [candidate.artist, candidate.artist_name, candidate.artistName].filter(Boolean).map(clean);
}
function datePrecision(date) {
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(date||'')) ? 'day' : /^\\d{4}-\\d{2}$/.test(String(date||'')) ? 'month' : /^\\d{4}$/.test(String(date||'')) ? 'year' : null;
}
async function getJson(fetcher,url,options={}) {
  const response=await fetcher(url,{...options,headers:{...MB_HEADERS,...(options.headers||{})}});
  if(response && typeof response==='object' && !('ok' in response)) return response;
  if(!response?.ok) return null;
  try { return await response.json(); } catch { return null; }
}
function relationUrl(recording, hosts) {
  const relations=Array.isArray(recording?.relations) ? recording.relations : [];
  for(const relation of relations) {
    const raw=relation?.url?.resource;
    if(!raw || !safeEvidenceUrl(raw)) continue;
    try {
      const host=new URL(raw).hostname.toLowerCase();
      if(hosts.some(h=>host===h || host.endsWith('.'+h))) return raw;
    } catch {}
  }
  return null;
}
export async function verifyReleaseCandidate(candidate,{fetcher,signal}={}) {
  const query=[candidate.title,candidate.artist].filter(Boolean).join(' ');
  if(!query || typeof fetcher!=='function') return {state:'unverified',reason:'missing-query'};
  const search=await getJson(fetcher,MB+'/recording?query='+encodeURIComponent(query)+'&limit=5&fmt=json');
  const rows=Array.isArray(search?.recordings) ? search.recordings : [];
  const row=rows.find(r=>titleMatch(r.title,candidate.title) &&
    artistNames(candidate).some(a=>(r['artist-credit']||[]).some(c=>titleMatch(c?.name||c?.artist?.name,a))));
  if(!row?.id) return {state:'unverified',reason:'musicbrainz-no-exact-recording'};
  const recording=await getJson(fetcher,MB+'/recording/'+encodeURIComponent(row.id)+'?inc=artists+releases+url-rels&fmt=json');
  const releases=Array.isArray(recording?.releases) ? recording.releases : [];
  const dated=releases.map(r=>({date:r.date,title:r.title,id:r.id})).filter(r=>datePrecision(r.date));
  dated.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const first=dated[0];
  const releaseDate=first?.date || null;
  const releasePage=relationUrl(recording,['soundcloud.com','bandcamp.com']);
  const evidenceUrl=releasePage || ('https://musicbrainz.org/recording/'+row.id);
  const recordingId='mbrecording:'+row.id.toLowerCase();
  const mbRecordingUrl='https://musicbrainz.org/recording/'+row.id.toLowerCase();
  const checkedAt=new Date().toISOString();
  const evidence=[
    {claimType:'release',verification:'verified',url:mbRecordingUrl,
      checkedAt,recordingId,claimDate:releaseDate,claimPrecision:'day'},
    {claimType:'release-page',verification:'verified',url:releasePage,
      checkedAt,recordingId,claimDate:releaseDate,claimPrecision:'day'}
  ];
  if(!releaseDate || datePrecision(releaseDate)!=='day')
    return {state:'unverified',reason:'release-date-not-day',recordingId,evidence};
  if(!releasePage)
    return {state:'unverified',reason:'no-permitted-provider-release-page',recordingId,evidence};
  return {
    state:'verified',
    recordingId,
    providerId:row.id.toLowerCase(),
    releaseDate,
    releasePrecision:'day',
    providerUrl:releasePage,
    evidence,
    reason:'exact-title-artist-musicbrainz-recording-with-provider-relation'
  };
}
export function applyReleaseVerification(candidate,verification) {
  if(!verification || verification.state!=='verified') {
    return {...candidate,verificationState:verification?.state||'unverified',verificationReason:verification?.reason||'not-verified'};
  }
  return {...candidate,identity:{status:'resolved',provider:'musicbrainz',providerId:verification.providerId,
      recordingId:verification.recordingId,sourceUrl:'https://musicbrainz.org/recording/'+verification.providerId},
    identityStatus:'resolved',identity_status:'resolved',
    recordingId:verification.recordingId,recording_id:verification.recordingId,
    releaseDate:verification.releaseDate,release_date:verification.releaseDate,
    releasePrecision:'day',release_precision:'day',
    providerUrl:verification.providerUrl,provider_url:verification.providerUrl,
    verificationState:'verified',verificationReason:verification.reason,
    destinations:[...(candidate.destinations||[]),{kind:'listen',url:verification.providerUrl}],
    evidence:[...(candidate.evidence||[]),...(verification.evidence||[])]
  };
}
