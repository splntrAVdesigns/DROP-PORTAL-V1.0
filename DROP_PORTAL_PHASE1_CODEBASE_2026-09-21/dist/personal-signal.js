export const signalLanes=['Future / Experimental','Deep / Minimal / Techy','Jungle / Breaks / Leftfield','Wildcard / Other'];
export function personalSignal(drop){
  const tracks=drop?.result?.tracks||[],profile=drop?.result?.profileSnapshot||drop?.profile_snapshot||null;
  const counts=[0,0,0,0];for(const t of tracks)counts[Number.isInteger(t.lane)&&t.lane>=0&&t.lane<3?t.lane:3]++;
  const key=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
  const artists=new Set((profile?.artists||[]).map(key)),labels=new Set((profile?.labels||[]).map(key));
  return {total:tracks.length,counts,profile,
    artistMatches:tracks.filter(t=>artists.has(key(t.artistName))).length,
    labelMatches:tracks.filter(t=>labels.has(key(t.label))).length,
    previews:tracks.filter(t=>t.preview?.kind==='provider-embed'||t.preview?.kind==='direct-audio').length};
}
