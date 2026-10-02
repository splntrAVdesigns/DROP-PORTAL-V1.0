import {weeklyDropCode} from './weekly-drop-code.js';
import {personal,sendCode,verifyCode,setPersonalFeedback,signOut,personalInteractions} from './personal.js';
import {privateDrops,loadPrivateDrops,retryPrivateDrop} from './personal-drops-client.js';
import {syncPersonalListening,setupPersonalListening,updatePersonalListening} from './personal-listening.js';
import {personalSignal,signalLanes} from './personal-signal.js';
import {formatReleaseDate,directPreview,embedPreview,primaryListen,primaryBuy} from './destinations.js';
import {heroMarkup,initHero,stopHero,paletteMarkup} from './hero.js';
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
function track(t,feedback){
  const direct=directPreview(t),embed=embedPreview(t);
  const playable=(direct&&!direct.previewUrl.startsWith('//'))||embed;
  const player=playable?`<button data-personal-preview="${esc(t.id)}" aria-pressed="false" aria-label="Open preview of ${esc(t.title)}"><span aria-hidden="true">▶</span> LISTEN · ${esc(direct?.provider||embed?.provider||'PREVIEW')}</button>`:'<span class="private-no-preview">Preview unavailable · use source link</span>';
  const listen=primaryListen(t)||primaryBuy(t);
  return `<article class="personal-track"><div class="personal-track-head"><span class="eyebrow">${String(t.personalRank||'—').padStart(2,'0')} / ${esc(t.subgenre||'DRUM & BASS')}</span><span>${esc(formatReleaseDate(t.releaseDate))}</span></div>
    <h3>${esc(t.title)}</h3><p>${esc(t.artistName)} · ${esc(t.label||'Label unverified')}</p><div class="private-preview">${player}</div>
    <p>${esc(t.personalReason||'Verified catalog match')} · ${esc(t.reason||'Verified release')}</p><div class="private-actions">${listen?`<a href="${esc(listen.url)}" target="_blank" rel="noopener noreferrer">Listen / details ↗</a>`:''}
    <button data-personal-track="${esc(t.id)}" data-personal-kind="saved" aria-pressed="${!!feedback[t.id]?.saved}">${feedback[t.id]?.saved?'Saved ✓':'Save'}</button>
    <button data-personal-track="${esc(t.id)}" data-personal-kind="heard" aria-pressed="${!!feedback[t.id]?.heard}">${feedback[t.id]?.heard?'Heard ✓':'Mark heard'}</button></div></article>`;
}

function icon(kind){const paths={signal:'M3 15v-4m5 4V6m5 9V3m5 12V8',schedule:'M4 5h14v13H4zM7 2v5m8-5v5M4 9h14m-9 3v3h3',crate:'M3 6h16v12H3zM7 6V3h8v3m-7 5h6',top:'M5 17 17 5M7 5h10v10'};return `<svg class="private-section-icon" viewBox="0 0 22 22" aria-hidden="true"><path d="${paths[kind]}"/></svg>`;}
function signalMarkup(signal){
 if(!signal.total)return '<p class="private-signal-empty">Your genre breakdown appears with your first completed dig.</p>';
 const p=signal.profile;
 return `<div class="private-signal"><div class="private-signal-stats"><span><strong>${signal.total}</strong> VERIFIED PICKS</span><span><strong>${signal.artistMatches}</strong> ARTIST MATCHES</span><span><strong>${signal.labelMatches}</strong> LABEL MATCHES</span></div><div class="private-distribution" role="img" aria-label="${esc(signal.counts.map((c,i)=>signalLanes[i]+': '+c).join(', '))}">${signal.counts.map((c,i)=>c?`<span class="signal-lane-${i}" style="flex:${c}" title="${esc(signalLanes[i])}: ${c}"></span>`:'').join('')}</div><div class="private-lane-key">${signal.counts.map((c,i)=>c?`<span><i class="signal-lane-${i}"></i>${esc(signalLanes[i])} <b>${c}</b></span>`:'').join('')}</div><details class="private-match-details"><summary>Why this dig matches your taste</summary><p>Actual selected-track distribution, using the taste snapshot saved with this dig.</p>${p?`<p>Lane priorities · Future ${p.future} / Deep ${p.deep} / Jungle ${p.jungle}. Discovery depth ${p.depth}; experimental bias ${p.experimental}. Release window ${esc({'1mo':'1 month','3mo':'3 months','6mo':'6 months','1yr':'1 year'}[p.searchPast]||p.searchPast)}.</p>`:'<p>No saved taste snapshot is available for this result.</p>'}<p>Preferred artist matches: ${signal.artistMatches}. Preferred label matches: ${signal.labelMatches}. These counts may overlap. Each card shows its own selection reason. Floor, darkness, and break density await verified audio analysis.</p></details></div>`;
}

function paintDashboard(app,markup,feedback){
  const owner=personal.user?.id||'';
  const temp=document.createElement('div');temp.innerHTML=markup;
  const oldResults=app.querySelector('.personal-results'),newResults=temp.querySelector('.personal-results');
  const oldHero=app.querySelector('.ascii-hero'),newHero=temp.querySelector('.ascii-hero');
  const signature=node=>{if(!node)return '';const copy=node.cloneNode(true);copy.querySelectorAll('[data-personal-track]').forEach(b=>{b.textContent='';b.removeAttribute('aria-pressed');});copy.querySelectorAll('[data-personal-preview]').forEach(b=>b.removeAttribute('aria-pressed'));copy.querySelectorAll('.private-panel-controls').forEach(n=>n.remove());return copy.innerHTML;};
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
  updatePersonalListening();
  const canvas=app.querySelector('#ascii-hero-canvas');
  if(canvas!==heroCanvas){stopHero();heroCanvas=canvas;if(canvas&&typeof canvas.getContext==='function'&&typeof IntersectionObserver!=='undefined'&&typeof ResizeObserver!=='undefined')initHero();}
}
export function renderPrivateDashboard(){
  const app=document.querySelector('#app');if(!app)return;
  const layout=personalLayout();
  const readyOwner=personal.checked&&availability==='ready'&&personal.user?.id===privateDrops.owner?personal.user.id:null;
  syncPersonalListening(readyOwner,readyOwner?privateDrops.drops.filter(d=>d.status==='ready').flatMap(d=>d.result?.tracks||[]):[]);
  const nav=document.querySelector('header nav');if(nav)nav.hidden=!personal.user;
  const tuner=document.querySelector('#tuner');if(tuner)tuner.hidden=!personal.user;
  const path=location.pathname.replace(/\/$/,'')||'/';
  app.classList.toggle('private-home',path==='/'&&!!personal.user&&privateDrops.owner===personal.user.id&&availability==='ready');
  const editor=document.querySelector('#edit');if(editor){editor.hidden=!personal.user||path!=='/'||availability!=='ready';editor.textContent=editing?'✓ DONE':'⊞ EDIT LAYOUT';editor.setAttribute('aria-expanded',String(editing));}
  const palette=document.querySelector('#palette-controls');if(palette){palette.hidden=!(editing&&personal.user&&availability==='ready');palette.innerHTML=palette.hidden?'':paletteMarkup();}
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
  const headline=`<div class="personal-hero"><span class="eyebrow">MY DROP / ${esc(personal.user.email)}</span><button data-private-signout>Sign out</button><h1>${icon("signal")} Your signal</h1><p class="private-next">Next weekly dig · ${esc(dateLabel(privateDrops.plan?.next_drop_at))}</p><button data-open-personal-tuner class="primary">TUNE + SCHEDULE</button>${message?`<p role="status">${esc(message)}</p>`:''}<p class="private-status">${privateDrops.error?esc(privateDrops.error):privateDrops.plan?'Weekly plan saved. Scheduled times are due times; processing may arrive later.':'Set your taste and weekly time to arm your first drop.'}</p></div>`;
  // Older server deployments may still return several unfinished one-time jobs.
  // Show only the most recently requested one until replacement is migrated.
  const activeOneTime=privateDrops.drops.filter(d=>d.kind==='one_time'&&d.status!=='ready'&&d.status!=='superseded')
    .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id)))[0]?.id;
  const history=privateDrops.drops.filter(d=>d.status!=='superseded'&&
    (d.kind!=='one_time'||d.status==='ready'||d.id===activeOneTime));
  if(path==='/archive'){
    paintDashboard(app,headline+`<section class="private-archive"><h2>My drop history</h2>${history.length?history.map(d=>`<button data-view-drop="${esc(d.id)}">${d.kind==='one_time'?'ONE TIME DIG':'WEEKLY DIG'} · ${esc(dateLabel(d.scheduled_at))} · ${esc(d.status.replaceAll('_',' '))}${weeklyDropCode(d)?`<span class="private-drop-code">${weeklyDropCode(d)}</span>`:''}</button>`).join(''):'<p>No personal drops yet.</p>'}</section>`,feedback);return;
  }
  if(path==='/saved'){
    const all=[...new Map(history.filter(d=>d.status==='ready').flatMap(d=>d.result?.tracks||[]).map(t=>[t.id,t])).values()];
    const saved=all.filter(t=>feedback[t.id]?.saved);
    paintDashboard(app,headline+`<section class="personal-results"><h2>Saved for later</h2><div class="personal-tracks">${saved.map(t=>track(t,feedback)).join('')||'<p>Your saved tracks will appear here.</p>'}</div></section>`,feedback);return;
  }
  const requested=location.hash.match(/^#drop=([0-9a-f-]{36})$/)?.[1];
  const drop=(requested&&history.find(d=>d.id===requested&&d.status==='ready'))||current;
  const signal=personalSignal(drop);
  const pending=history.filter(d=>d.status!=='ready');
  paintDashboard(app,heroMarkup()+headline.replace('class="personal-hero"',`class="personal-hero" style="order:${layout.order.indexOf('queue')+2}"`).replace('</div>',signalMarkup(signal)+'</div>')+`<section class="private-queue ${layout.sizes.queue}" style="order:${layout.order.indexOf('queue')+2}">${panelControls('queue')}<h2>${icon("schedule")} Upcoming & research status</h2><p class="private-heartbeat">Last successful worker check · ${privateDrops.health?.lastSuccessAt?esc(dateLabel(privateDrops.health.lastSuccessAt)):'No successful check recorded'}</p>${privateDrops.plan?`<p class="private-weekly-time"><b>WEEKLY DIG</b> · ${esc(dateLabel(privateDrops.plan.next_drop_at))} · ${Date.now()-Date.parse(privateDrops.plan.next_drop_at)>20*60000?'overdue · awaiting worker':'scheduled'}</p>`:''}${pending.length?pending.map(d=>`<p><b>${d.kind==='one_time'?'ONE TIME DIG':'WEEKLY DIG'}</b> · ${esc(dateLabel(d.scheduled_at))} · ${esc(d.status==='queued'&&Date.now()-Date.parse(d.scheduled_at)>20*60000?'overdue · awaiting worker':d.status.replaceAll('_',' '))}${d.status_detail?' · '+esc(d.status_detail):''}${['failed','needs_research'].includes(d.status)?` <button data-retry-drop="${esc(d.id)}">RETRY DIG</button>`:''}</p>`).join(''):'<p>No one-time digs queued.</p>'}</section>
  <section class="personal-results ${layout.sizes.results}" style="order:${layout.order.indexOf('results')+2}">${panelControls('results')}<div class="private-drop-heading"><div><span class="eyebrow">${drop?'VERIFIED CATALOG SELECTION':'WAITING FOR YOUR FIRST DROP'}</span><h2>${icon("crate")} ${drop?.kind==='one_time'?'One Time Dig':'My weekly drop'}</h2></div>${weeklyDropCode(drop)?`<span class="private-drop-code" aria-label="Weekly drop ${drop.weekly_sequence}">${weeklyDropCode(drop)}</span>`:''}</div>
  ${drop?`<p>${esc(drop.result.note)}</p><section class="personal-top-three" aria-label="Top 3 picks"><h3>${icon('top')} Top 3 <small>START HERE</small></h3><div class="personal-tracks">${drop.result.tracks.slice(0,3).map(t=>track(t,feedback)).join('')}</div></section><section class="personal-remaining" aria-label="Remaining recommendations"><h3>${icon('crate')} Dig deeper <small>${Math.max(0,drop.result.tracks.length-3)} MORE PICKS</small></h3><div class="personal-tracks">${drop.result.tracks.slice(3).map(t=>track(t,feedback)).join('')}</div></section>`:'<p>Save a personal weekly plan or queue a One Time Dig in the Tuner. Results are visible only to your account.</p>'}</section>`,feedback);
}
export function setupPrivateDashboard(){
  if(initialized)return;initialized=true;setupPersonalListening();
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
    if(b.dataset.retryDrop){try{await retryPrivateDrop(b.dataset.retryDrop);message='Retry queued.';}catch(error){message=error.message;}renderPrivateDashboard();return;}
    if(b.dataset.viewDrop){location.href='/#drop='+encodeURIComponent(b.dataset.viewDrop);}
    if(b.dataset.personalTrack){const current=personalInteractions()[b.dataset.personalTrack];try{await setPersonalFeedback(b.dataset.personalTrack,b.dataset.personalKind,!current?.[b.dataset.personalKind]);renderPrivateDashboard();}catch(error){message=error.message;renderPrivateDashboard();}}
  });
  setInterval(()=>{if(enabled&&personal.user&&!document.hidden)loadPrivateDrops();},60000);
}
