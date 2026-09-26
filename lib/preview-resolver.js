// Resolve only official Bandcamp pages already attached to a known track.
// Signed audio URLs are deliberately never stored or proxied.
const identity=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function bandcampPage(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^[a-z0-9-]+\.bandcamp\.com$/.test(u.hostname)&&/^\/(album|track)\/[a-z0-9-]+\/?$/.test(u.pathname)?u:null}catch{return null}
}
function decode(value){return value.replace(/&(quot|amp|lt|gt|apos|#\d+|#x[\da-f]+);/gi,(all,x)=>{
  if(x[0]==='#')return String.fromCodePoint(x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):Number(x.slice(1)));
  return {quot:'"',amp:'&',lt:'<',gt:'>',apos:"'"}[x.toLowerCase()]||all;
});}
export function bandcampPreview(html,track,sourceUrl){
  const source=bandcampPage(sourceUrl);if(!source)throw Error('Unsupported source URL');
  const match=html.match(/\bdata-tralbum="([^"]+)"/);if(!match)return null;
  const data=JSON.parse(decode(match[1]));
  const matches=(data.trackinfo||[]).filter(t=>identity(t.title)===identity(track.title)&&identity(t.artist||data.artist)===identity(track.artistName));
  if(matches.length!==1)return null;
  const t=matches[0];
  if(!Number.isSafeInteger(t.track_id)||t.track_id<=0||t.streaming!==1||t.private||t.is_draft)return null;
  return {id:track.id,preview:{kind:'provider-embed',provider:'BANDCAMP',embedUrl:`https://bandcamp.com/EmbeddedPlayer/track=${t.track_id}/size=small/bgcol=333333/linkcol=04d9ff/transparent=false/`},
    evidence:{sourceUrl:source.href,artist:track.artistName,title:t.title,providerTrackId:String(t.track_id),checkedAt:new Date().toISOString()}};
}
export async function resolveBandcampTracks(tracks,{fetcher=fetch}={}){
  const pages=new Map(),results=[],unresolved=[];
  for(const track of tracks){
    if(track.preview)continue;
    let resolved=null;
    for(const link of track.links||[]){
      const url=bandcampPage(link.url);if(!url)continue;
      try{
        if(!pages.has(url.href)){
          const r=await fetcher(url.href,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'DROP-PORTAL/preview-resolver'}});
          if(!r.ok)throw Error('Source HTTP '+r.status);
          const text=await r.text();if(text.length>2_000_000)throw Error('Source too large');
          pages.set(url.href,text);
        }
        resolved=bandcampPreview(pages.get(url.href),track,url.href);
        if(resolved)break;
      }catch(error){pages.set(url.href,'');}
    }
    if(resolved)results.push(resolved);else unresolved.push(track.id);
  }
  return {results,unresolved};
}
