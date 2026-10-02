import {currentHeroPalette,setupHeroPalette} from './hero.js';
import {waveformMarkup,animateWaveform} from './listening-waveform.js';
import {setupPlayerPosition} from './listening-position.js';
import {directPreview,embedPreview} from './destinations.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let owner=null,catalog=new Map(),active=null,media=null,collapsed=false,initialized=false,epoch=0,waveCleanup=null,positionCleanup=null;
export const listeningState=()=>({owner,trackId:active?.id||null,kind:active?.kind||null});
export function syncPersonalListening(nextOwner,tracks=[]){
  if(nextOwner!==owner){stopPersonalListening();owner=nextOwner;}
  catalog=new Map();for(const track of tracks)if(!catalog.has(track.id))catalog.set(track.id,track);
}
function dock(){
  let node=document.querySelector('#personal-listening-dock');
  if(!node){node=document.createElement('section');node.id='personal-listening-dock';node.setAttribute('aria-label','Personal listening player');node.hidden=true;document.body.append(node);}
  return node;
}
export function stopPersonalListening(){
  epoch++;waveCleanup?.();waveCleanup=null;positionCleanup?.();positionCleanup=null;if(media?.tagName==='AUDIO'){media.pause();media.removeAttribute('src');media.load();}
  media?.remove();media=null;active=null;collapsed=false;
  const node=document.querySelector('#personal-listening-dock');if(node){node.replaceChildren();node.hidden=true;}
  document.querySelector('#personal-listening-restore')?.remove();
  document.querySelectorAll('[data-personal-preview]').forEach(b=>b.setAttribute('aria-pressed','false'));
}
export function updatePersonalListening(){
  if(!active)return;
  const node=dock(),audio=active.kind==='audio';
  const toggle=node.querySelector('[data-listening-toggle]');
  if(toggle){toggle.disabled=!audio;toggle.textContent=audio&&!media.paused?'Ⅱ':'▶';toggle.setAttribute('aria-label',audio&&!media.paused?'Pause preview':'Play preview');}
  const seek=node.querySelector('[data-listening-seek]');
  if(seek&&audio){seek.disabled=!Number.isFinite(media.duration);seek.max=String(Number.isFinite(media.duration)?media.duration:0);seek.value=String(media.currentTime||0);}
  const time=node.querySelector('.personal-listening-time');
  const fmt=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
  if(time&&audio)time.textContent=media.error?'Preview unavailable — use the source link':`${fmt(media.currentTime)} / ${fmt(Number.isFinite(media.duration)?media.duration:0)}`;
  document.querySelectorAll('[data-personal-preview]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.personalPreview===active.id)));
}
export async function playPersonalPreview(id){
  const track=catalog.get(id);if(!owner||!track)return;
  if(active?.id===id){collapsed=false;dock().hidden=false;dock().dispatchEvent(new (document.defaultView?.Event||Event)('listening-layout-change'));document.querySelector('#personal-listening-restore')?.remove();if(active.kind==='audio'){if(media.paused)await media.play().catch(()=>{});else media.pause();}updatePersonalListening();return;}
  const direct=directPreview(track),embed=direct?null:embedPreview(track);
  // Protocol-relative paths are not local authorized previews.
  if(!embed&&(!direct||direct.previewUrl.startsWith('//')))return;
  stopPersonalListening();const token=epoch;
  active={id,kind:direct?'audio':'embed'};
  const node=dock();node.hidden=false;
  node.innerHTML=`<div class="personal-listening-head" data-listening-drag tabindex="0" aria-label="Move player on desktop using drag or arrow keys"><div><span class="eyebrow">LISTENING / ${esc(direct?.provider||embed?.provider||'AUTHORIZED PREVIEW')}</span><strong>${esc(track.title)}</strong><small>${esc(track.artistName)}</small></div><div class="personal-listening-head-actions">${direct?'':'<span class="personal-listening-note">Playback controls are inside the provider player.</span>'}<button data-listening-reset-position aria-label="Reset player position" title="Reset player position">⌖</button><button data-listening-minimize aria-label="Minimize player">−</button><button data-listening-stop aria-label="Stop and unload preview">✕</button></div></div><div class="personal-listening-media"></div><div class="personal-listening-controls">${waveformMarkup()}<button data-listening-previous ${direct?'':'disabled'} aria-label="Previous playable preview">←</button><button data-listening-toggle ${direct?'':'disabled'} aria-label="Play preview">▶</button><button data-listening-next ${direct?'':'disabled'} aria-label="Next playable preview">→</button>${direct?'<input data-listening-seek type="range" min="0" max="0" value="0" step=".1" disabled aria-label="Seek preview"><span class="personal-listening-time"></span><label>VOL <input data-listening-volume type="range" min="0" max="1" value=".65" step=".01" aria-label="Preview volume"></label>':''}</div>`;
  if(direct){
    media=document.createElement('audio');media.preload='metadata';media.volume=.65;media.src=direct.previewUrl;
    for(const event of ['playing','pause','ended','error','timeupdate','loadedmetadata'])media.addEventListener(event,()=>{if(token===epoch)updatePersonalListening();});
    node.querySelector('.personal-listening-media').append(media);updatePersonalListening();await media.play().catch(()=>{if(token===epoch){const el=node.querySelector('.personal-listening-time');if(el)el.textContent='Tap play to retry, or use the source link.';}});
  }else{
    media=document.createElement('iframe');media.src=embed.url;media.dataset.provider=embed.provider;media.title=`Preview ${track.artistName} — ${track.title}`;media.allow='autoplay';media.referrerPolicy='no-referrer';media.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');node.querySelector('.personal-listening-media').append(media);updatePersonalListening();
  }
  if(token===epoch&&active){applyPalette();waveCleanup=animateWaveform(node.querySelector('.personal-listening-wave'),direct?media:null);positionCleanup=setupPlayerPosition(node,owner);}
}
function applyPalette(){const colors=currentHeroPalette().colors,node=document.querySelector('#personal-listening-dock');if(node){node.style.setProperty('--listening-color-a',colors[0]);node.style.setProperty('--listening-color-b',colors[1]);}}
export function setupPersonalListening(){
  if(initialized)return;initialized=true;setupHeroPalette();document.addEventListener('hero-palette-change',applyPalette);
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.personalPreview){playPersonalPreview(b.dataset.personalPreview);return;}
    if(b.hasAttribute('data-listening-stop')){stopPersonalListening();return;}
    if(b.hasAttribute('data-listening-minimize')&&active){collapsed=true;dock().hidden=true;const restore=document.createElement('button');restore.id='personal-listening-restore';restore.textContent='▲ LISTENING';restore.setAttribute('aria-label','Restore personal player');document.body.append(restore);return;}
    if(b.id==='personal-listening-restore'){collapsed=false;dock().hidden=false;dock().dispatchEvent(new (document.defaultView?.Event||Event)('listening-layout-change'));b.remove();return;}
    if(!active||active.kind!=='audio'||b.disabled)return;
    if(b.hasAttribute('data-listening-toggle')){if(media.paused)media.play().catch(()=>{});else media.pause();}
    if(b.hasAttribute('data-listening-next')||b.hasAttribute('data-listening-previous')){const ids=[...catalog.values()].filter(t=>directPreview(t)&&!t.preview.previewUrl.startsWith('//')).map(t=>t.id);const i=ids.indexOf(active.id);if(ids.length)playPersonalPreview(ids[(i+(b.hasAttribute('data-listening-next')?1:-1)+ids.length)%ids.length]);}
  });
  document.addEventListener('input',event=>{
    if(active?.kind!=='audio')return;
    if(event.target.hasAttribute('data-listening-seek')&&Number.isFinite(media.duration))media.currentTime=Math.max(0,Math.min(media.duration,Number(event.target.value)));
    if(event.target.hasAttribute('data-listening-volume'))media.volume=Math.max(0,Math.min(1,Number(event.target.value)));
  });
}
