import {personal,sendCode,verifyCode,setPersonalFeedback,signOut,personalInteractions} from './personal.js';
import {privateDrops,loadPrivateDrops} from './personal-drops-client.js';
import {formatReleaseDate} from './destinations.js';
import {heroMarkup,initHero,stopHero} from './hero.js';
import {read,write} from './storage.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let email='',codeSent=false,busy=false,message='',initialized=false;
let enabled=false,availability='ready';
let editing=false,layoutOwner=null,heroCanvas=null;
const defaultLayout={order:['queue','results'],sizes:{queue:'wide',results:'wide'}};
function personalLayout(){
  const id=personal.user?.id;
  if(layoutOwner!==id){layoutOwner=id;editing=false;}
  if(!id)return defaultLayout;
  const saved=read('private-layout:'+id,null);
  const order=Array.isArray(saved?.order)&&saved.order.length===2&&new Set(saved.order).size===2&&saved.order.every(k=>['queue','results'].includes(k))?saved.order:defaultLayout.order;
  return {order,sizes:Object.fromEntries(['queue','results'].map(k=>[k,saved?.sizes?.[k]==='compact'?'compact':'wide']))};
}
function changeLayout(kind,value){
  const current=personalLayout(),next={order:[...current.order],sizes:{...current.sizes}};
  if(kind==='order')next.order.reverse();
  if(kind==='size'&&['queue','results'].includes(value))next.sizes[value]=next.sizes[value]==='wide'?'compact':'wide';
  write('private-layout:'+personal.user.id,next);renderPrivateDashboard();
}
function panelControls(key){return editing?`<div class="private-panel-controls"><span>${key==='queue'?'UPCOMING':'MY DROP'}</span><button data-private-layout="order" aria-label="Swap panel order">Move ${key==='queue'?'after results':'before upcoming'}</button><button data-private-layout="size" data-layout-panel="${key}">Toggle width</button></div>`:'';}
export function setPrivateAvailability(value){availability=value;}
export function enablePrivateDashboard(){enabled=true;if(personal.user)loadPrivateDrops();}
const dateLabel=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(v)):'Not scheduled';
function trustedEmbed(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(
    u.hostname==='bandcamp.com'&&u.pathname.startsWith('/EmbeddedPlayer/')||
    u.hostname==='w.soundcloud.com'&&u.pathname.startsWith('/player/')||
    u.hostname==='www.mixcloud.com'&&u.pathname.startsWith('/widget/'));}catch{return false;}
}
function track(t,feedback){
  const preview=t.preview;
  let player='<span class="private-no-preview">Preview unavailable</span>';
  if(preview?.kind==='provider-embed'&&trustedEmbed(preview.embedUrl))player=`<iframe loading="lazy" title="Preview ${esc(t.artistName)} — ${esc(t.title)}" src="${esc(preview.embedUrl)}" allow="autoplay" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`;
  else if(preview?.kind==='direct-audio'&&/^(https:\/\/|\/)/.test(preview.previewUrl))player=`<audio controls preload="none" src="${esc(preview.previewUrl)}"></audio>`;
  const listen=t.links?.find(l=>l.kind==='listen'||l.kind==='buy')||t.links?.[0];
  return `<article class="personal-track"><div class="personal-track-head"><span class="eyebrow">${String(t.personalRank).padStart(2,'0')} / ${esc(t.subgenre||'DRUM & BASS')}</span><span>${esc(formatReleaseDate(t.releaseDate))}</span></div>
    <h3>${esc(t.title)}</h3><p>${esc(t.artistName)} · ${esc(t.label||'Label unverified')}</p><div class="private-preview">${player}</div>
    <p>${esc(t.personalReason)} · ${esc(t.reason)}</p><div class="private-actions">${listen?`<a href="${esc(listen.url)}" target="_blank" rel="noopener noreferrer">Listen / details ↗</a>`:''}
    <button data-personal-track="${esc(t.id)}" data-personal-kind="saved" aria-pressed="${!!feedback[t.id]?.saved}">${feedback[t.id]?.saved?'Saved ✓':'Save'}</button>
    <button data-personal-track="${esc(t.id)}" data-personal-kind="heard" aria-pressed="${!!feedback[t.id]?.heard}">${feedback[t.id]?.heard?'Heard ✓':'Mark heard'}</button></div></article>`;
}
function paintDashboard(app,markup,feedback){
  const owner=personal.user?.id||'';
  const temp=document.createElement('div');temp.innerHTML=markup;
  const oldResults=app.querySelector('.personal-results'),newResults=temp.querySelector('.personal-results');
  const oldHero=app.querySelector('.ascii-hero'),newHero=temp.querySelector('.ascii-hero');
  const signature=node=>{if(!node)return '';const copy=node.cloneNode(true);copy.querySelectorAll('[data-personal-track]').forEach(b=>{b.textContent='';b.removeAttribute('aria-pressed');});copy.querySelectorAll('.private-panel-controls').forEach(n=>n.remove());return copy.innerHTML;};
  if(app.dataset.owner===owner&&oldResults&&newResults&&signature(oldResults)===signature(newResults)){
    // Keep the live media subtree attached. Update surrounding status and feedback only.
    for(const child of [...app.children])if(child!==oldResults&&child!==oldHero)child.remove();
    if(oldHero&&!newHero)oldHero.remove();
    for(const child of [...temp.children]){if(child===newResults||child===newHero&&oldHero)continue;app.insertBefore(child,oldResults);}
    oldResults.className=newResults.className;oldResults.style.cssText=newResults.style.cssText;
    oldResults.querySelector('.private-panel-controls')?.remove();
    const controls=newResults.querySelector('.private-panel-controls');if(controls)oldResults.insertBefore(controls,oldResults.firstChild);
    oldResults.querySelectorAll('[data-personal-track]').forEach(b=>{
      const kind=b.dataset.personalKind,on=!!feedback[b.dataset.personalTrack]?.[kind];
      b.setAttribute('aria-pressed',String(on));b.textContent=kind==='saved'?(on?'Saved ✓':'Save'):(on?'Heard ✓':'Mark heard');
    });
  }else app.innerHTML=markup;
  app.dataset.owner=owner;
  const canvas=app.querySelector('#ascii-hero-canvas');
  if(canvas!==heroCanvas){stopHero();heroCanvas=canvas;if(canvas&&typeof canvas.getContext==='function'&&typeof IntersectionObserver!=='undefined'&&typeof ResizeObserver!=='undefined')initHero();}
}
export function renderPrivateDashboard(){
  const app=document.querySelector('#app');if(!app)return;
  const layout=personalLayout();
  const nav=document.querySelector('header nav');if(nav)nav.hidden=!personal.user;
  const tuner=document.querySelector('#tuner');if(tuner)tuner.hidden=!personal.user;
  const path=location.pathname.replace(/\/$/,'')||'/';
  app.classList.toggle('private-home',path==='/'&&!!personal.user&&privateDrops.owner===personal.user.id&&availability==='ready');
  const editor=document.querySelector('#edit');if(editor){editor.hidden=!personal.user||path!=='/'||availability!=='ready';editor.textContent=editing?'✓ DONE':'⊞ EDIT LAYOUT';editor.setAttribute('aria-expanded',String(editing));}
  const palette=document.querySelector('#palette-controls');if(palette)palette.hidden=true;
  if(availability!=='ready'){
    stopHero();heroCanvas=null;
    if(nav)nav.hidden=true;if(tuner)tuner.hidden=true;
    app.innerHTML=`<section class="auth-page"><div class="auth-card"><span class="eyebrow">DROP:PORTAL</span><h1>${availability==='checking'?'Connecting your portal…':availability==='setup_required'?'Your portal is being prepared.':'Connection unavailable.'}</h1><p>${availability==='checking'?'Checking availability.':'Please retry shortly. Your saved preferences remain private.'}</p>${availability==='checking'?'':'<button data-private-retry>RETRY</button>'}</div></section>`;return;
  }
  if(!personal.checked){stopHero();heroCanvas=null;app.innerHTML='<section class="auth-page"><div class="auth-card"><span class="eyebrow">PRIVATE BETA</span><h1>Connecting your portal…</h1></div></section>';return;}
  if(!personal.user){
    stopHero();heroCanvas=null;
    app.innerHTML=`<section class="auth-page"><div class="auth-card"><span class="eyebrow">DROP:PORTAL / PRIVATE BETA</span><h1>Your next dig starts here.</h1><p>Sign in to open your personal Drum & Bass dashboard.</p>
    <form id="portal-login"><label for="portal-email">EMAIL ADDRESS</label><input id="portal-email" type="email" autocomplete="email" value="${esc(email)}" required>
    ${codeSent?'<label for="portal-code">SIGN-IN CODE</label><input id="portal-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required>':''}
    <button class="primary" type="submit" ${busy?'disabled':''}>${busy?'PLEASE WAIT…':codeSent?'VERIFY CODE':'SEND SIGN-IN CODE'}</button></form>
    ${codeSent?'<button data-login-reset>Use another email / resend</button>':''}${message?`<p role="status">${esc(message)}</p>`:''}</div></section>`;return;
  }
  if(privateDrops.owner!==personal.user.id){stopHero();heroCanvas=null;app.innerHTML='<section class="auth-page"><p>Loading your private drops…</p></section>';return;}
  const current=privateDrops.drops.find(d=>d.status==='ready')||null;
  const feedback=personalInteractions();
  const savedCount=document.querySelector('#saved-count');if(savedCount)savedCount.textContent=Object.values(feedback).filter(v=>v.saved).length;
  const headline=`<div class="personal-hero"><span class="eyebrow">MY DROP / ${esc(personal.user.email)}</span><button data-private-signout>Sign out</button><h1>Your signal.</h1><p>Next weekly dig · ${esc(dateLabel(privateDrops.plan?.next_drop_at))}</p><button data-open-personal-tuner class="primary">TUNE + SCHEDULE</button>${message?`<p role="status">${esc(message)}</p>`:''}<p class="private-status">${privateDrops.error?esc(privateDrops.error):privateDrops.plan?'Weekly plan saved. Your drop appears here after processing. The worker checks approximately every 15 minutes.':'Set your taste and weekly time to arm your first drop.'}</p></div>`;
  // Older server deployments may still return several unfinished one-time jobs.
  // Show only the most recently requested one until replacement is migrated.
  const activeOneTime=privateDrops.drops.filter(d=>d.kind==='one_time'&&d.status!=='ready'&&d.status!=='superseded')
    .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id)))[0]?.id;
  const history=privateDrops.drops.filter(d=>d.status!=='superseded'&&
    (d.kind!=='one_time'||d.status==='ready'||d.id===activeOneTime));
  if(path==='/archive'){
    paintDashboard(app,headline+`<section class="private-archive"><h2>My drop history</h2>${history.length?history.map(d=>`<button data-view-drop="${esc(d.id)}">${d.kind==='one_time'?'ONE TIME DIG':'WEEKLY DIG'} · ${esc(dateLabel(d.scheduled_at))} · ${esc(d.status.replaceAll('_',' '))}</button>`).join(''):'<p>No personal drops yet.</p>'}</section>`,feedback);return;
  }
  if(path==='/saved'){
    const all=[...new Map(history.filter(d=>d.status==='ready').flatMap(d=>d.result?.tracks||[]).map(t=>[t.id,t])).values()];
    const saved=all.filter(t=>feedback[t.id]?.saved);
    paintDashboard(app,headline+`<section class="personal-results"><h2>Saved for later</h2><div class="personal-tracks">${saved.map(t=>track(t,feedback)).join('')||'<p>Your saved tracks will appear here.</p>'}</div></section>`,feedback);return;
  }
  const requested=location.hash.match(/^#drop=([0-9a-f-]{36})$/)?.[1];
  const drop=(requested&&history.find(d=>d.id===requested&&d.status==='ready'))||current;
  const pending=history.filter(d=>d.status!=='ready');
  paintDashboard(app,heroMarkup()+headline+`<section class="private-queue ${layout.sizes.queue}" style="order:${layout.order.indexOf('queue')+2}">${panelControls('queue')}<h2>Upcoming & research status</h2>${pending.length?pending.map(d=>`<p><b>${d.kind==='one_time'?'ONE TIME DIG':'WEEKLY DIG'}</b> · ${esc(dateLabel(d.scheduled_at))} · ${esc(d.status.replaceAll('_',' '))}${d.status_detail?' · '+esc(d.status_detail):''}</p>`).join(''):'<p>No one-time digs queued.</p>'}</section>
  <section class="personal-results ${layout.sizes.results}" style="order:${layout.order.indexOf('results')+2}">${panelControls('results')}<span class="eyebrow">${drop?'VERIFIED CATALOG SELECTION':'WAITING FOR YOUR FIRST DROP'}</span><h2>${drop?.kind==='one_time'?'One Time Dig':'My weekly drop'}</h2>
  ${drop?`<p>${esc(drop.result.note)}</p><h3>Start here · Top 3</h3><p>${drop.result.tracks.slice(0,3).map(t=>esc(t.artistName)+' — '+esc(t.title)).join(' · ')}</p><div class="personal-tracks">${drop.result.tracks.map(t=>track(t,feedback)).join('')}</div>`:'<p>Save a personal weekly plan or queue a One Time Dig in the Tuner. Results are visible only to your account.</p>'}</section>`,feedback);
}
export function setupPrivateDashboard(){
  if(initialized)return;initialized=true;
  window.addEventListener('privatedropschange',()=>{if(enabled)renderPrivateDashboard();});
  window.addEventListener('personalchange',()=>{if(!enabled)return;if(personal.user?.id!==privateDrops.owner)loadPrivateDrops();renderPrivateDashboard();});
  window.addEventListener('hashchange',()=>{if(enabled)renderPrivateDashboard();});
  document.addEventListener('submit',async e=>{
    if(!enabled||e.target.id!=='portal-login')return;e.preventDefault();email=e.target.querySelector('#portal-email').value.trim();const code=e.target.querySelector('#portal-code')?.value;busy=true;message='';renderPrivateDashboard();
    try{if(codeSent){await verifyCode(email,code);codeSent=false;}else{await sendCode(email);codeSent=true;message='Check your email for the sign-in code.';}}
    catch(error){message=error.message;}finally{busy=false;renderPrivateDashboard();}
  });
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-private-retry')){location.reload();return;}if(!enabled)return;
    if(b.id==='edit'&&personal.user){editing=!editing;renderPrivateDashboard();return;}
    if(b.dataset.privateLayout&&personal.user&&editing){changeLayout(b.dataset.privateLayout,b.dataset.layoutPanel);return;}
    if(b.hasAttribute('data-login-reset')){codeSent=false;message='';renderPrivateDashboard();}
    if(b.hasAttribute('data-open-personal-tuner'))document.querySelector('#tuner').click();
    if(b.hasAttribute('data-private-signout')){await signOut();}
    if(b.dataset.viewDrop){location.href='/#drop='+encodeURIComponent(b.dataset.viewDrop);}
    if(b.dataset.personalTrack){const current=personalInteractions()[b.dataset.personalTrack];try{await setPersonalFeedback(b.dataset.personalTrack,b.dataset.personalKind,!current?.[b.dataset.personalKind]);renderPrivateDashboard();}catch(error){message=error.message;renderPrivateDashboard();}}
  });
  setInterval(()=>{if(enabled&&personal.user&&!document.hidden)loadPrivateDrops();},60000);
}
