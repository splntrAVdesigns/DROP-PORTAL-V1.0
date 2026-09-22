const states=new Map();
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(feat|ft|featuring)\.?\b.*$/,'').replace(/[^a-z0-9]+/g,' ').trim();
const tokens=value=>new Set(normalize(value).split(' ').filter(Boolean));
function similarity(a,b){const left=tokens(a),right=tokens(b);if(!left.size||!right.size)return 0;let shared=0;for(const word of left)if(right.has(word))shared++;return shared/Math.max(left.size,right.size)}
function exact(a,b){return normalize(a)===normalize(b)}
function candidateScore(track,result){const title=result.trackName||result.title,artist=result.artistName||result.artist?.name,release=result.collectionName||result.album?.title;const titleFit=exact(track.title,title)?1:similarity(track.title,title),artistFit=exact(track.artistName,artist)?1:similarity(track.artistName,artist),releaseFit=exact(track.release,release)?1:similarity(track.release,release);if(titleFit<.88||artistFit<.64)return 0;return titleFit*.58+artistFit*.34+releaseFit*.08}
function safeHttps(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}}
async function requestJson(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);try{const response=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Preview lookup failed');return response.json()}finally{clearTimeout(timer)}}
async function appleResults(track,country){const term=encodeURIComponent(`${track.artistName} ${track.title}`);const data=await requestJson(`https://itunes.apple.com/search?term=${term}&country=${country}&media=music&entity=song&limit=25`);return Array.isArray(data.results)?data.results:[]}
async function deezerResults(track){const query=encodeURIComponent(`artist:\"${track.artistName}\" track:\"${track.title}\"`);const data=await requestJson(`https://api.deezer.com/search?q=${query}&limit=25&output=json`);return Array.isArray(data.data)?data.data:[]}
async function resolveTrack(track){
  const pools=[];
  for(const country of ['US','GB']){
    try{pools.push(...await appleResults(track,country))}catch{}
  }
  const apple=pools.map(result=>({result,score:candidateScore(track,result)})).sort((a,b)=>b.score-a.score)[0];
  if(apple?.score>=.88){
    const previewUrl=safeHttps(apple.result.previewUrl),destination=safeHttps(apple.result.trackViewUrl);
    if(previewUrl)return{preview:{provider:'APPLE MUSIC',kind:'direct-audio',previewUrl,durationSec:30,usageBasis:'provider-authorized-preview',attribution:'30-second preview supplied by Apple Music.'},destination};
  }
  try{
    const pool=await deezerResults(track),deezer=pool.map(result=>({result,score:candidateScore(track,result)})).sort((a,b)=>b.score-a.score)[0];
    if(deezer?.score>=.88){
      const previewUrl=safeHttps(deezer.result.preview),destination=safeHttps(deezer.result.link);
      if(previewUrl)return{preview:{provider:'DEEZER',kind:'direct-audio',previewUrl,durationSec:30,usageBasis:'provider-authorized-preview',attribution:'30-second preview supplied by Deezer.'},destination};
    }
  }catch{}
  return null;
}
export function previewState(track){if(track?.preview?.kind==='direct-audio')return'ready';return states.get(track?.id)||'idle'}
async function worker(queue,stats){while(queue.length){const track=queue.shift();try{const resolved=await resolveTrack(track);if(!resolved){states.set(track.id,'unavailable');stats.unavailable++;continue}track.preview=resolved.preview;if(resolved.destination&&!track.links?.some(link=>link.url===resolved.destination))track.links.push({kind:'listening',url:resolved.destination});states.set(track.id,'ready');stats.ready++}catch{states.set(track.id,'unavailable');stats.unavailable++}}}
export async function hydrateTrackPreviews(items){const queue=items.filter(track=>track&&!track.demo&&track.preview?.kind!=='direct-audio');for(const track of queue)states.set(track.id,'loading');const stats={ready:items.filter(track=>track?.preview?.kind==='direct-audio').length,unavailable:0,total:items.length};await Promise.all(Array.from({length:Math.min(3,queue.length)},()=>worker(queue,stats)));return stats}
