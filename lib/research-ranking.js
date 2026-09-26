import {inWindow} from './research-window.js';

const key=(artist,title)=>[artist,title].map(s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()).join('|');
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
export function rankCandidates(candidates,{profile,window,archive=[]}){
  const depth=profile.depth;
  if(!Number.isFinite(depth)||depth<0||depth>100)throw Error('Invalid Discovery depth');
  const prior=new Set(archive.flatMap(drop=>(drop.tracks||[]).map(t=>key(t.artistName,t.title))));
  const span=Math.max(1,(Date.parse(window.to+'T00:00:00Z')-Date.parse(window.from+'T00:00:00Z'))/86400000);
  return candidates.map(c=>{
    const date=c.releaseDate||c.uploadedAt;
    const eligible=!!c.releaseDate&&inWindow(c.releaseDate,window);
    const age=inWindow(date,window)?Math.min(1,(Date.parse(window.to+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000/span):0;
    const repeated=prior.has(key(c.artistName,c.title));
    const evidence=Math.min(2,c.evidence?.length||0);
    const reach=Number.isFinite(c.reachCount)?c.reachCount:null;
    const lowReach=reach!==null&&reach<10000;
    const exploration=20*(depth/100)*age+20*(1-depth/100)*(1-age)+
      (lowReach?10*(depth/100):0);
    const score=clamp(40+evidence*8+(eligible?12:-12)+exploration-(repeated?45:0)-(c.reviewStatus==='rejected'?100:0));
    const reasons=[eligible?'release in selected window':c.releaseDate?'release outside selected window':'release date needs verification',
      age>=0.5?'older portion of selected window':'recent portion of selected window',
      evidence>1?'multiple source links':'one source link'];
    if(lowReach)reasons.push('lower SoundCloud reach is an exploration clue, not an audio-quality assessment');
    if(repeated)reasons.push('appeared in a recent published drop');
    return {...c,ranking:{score,depth,eligible,repeated,reasons,window,
      note:'Discovery priority only. Audio quality, musical fit, and release identity need review.'}};
  }).sort((a,b)=>b.ranking.score-a.ranking.score||a.artistName.localeCompare(b.artistName));
}
