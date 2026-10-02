import {personal,loadPersonal,sendCode,verifyCode,signOut,savePersonal,importPersonalHistory,exportPersonal,deletePersonal} from './personal.js';
import {PERSONAL_DEFAULTS,cleanPersonalProfile,cleanNames} from './personal-contracts.js';
import {read} from './storage.js';
import {tracks} from './data.js';
import {localDate} from './contracts.js';
import {privateDrops,savePrivatePlan,requestOneTimeDig,loadPrivateDrops} from './personal-drops-client.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sliders=[['future','Future / Experimental'],['deep','Deep / Minimal / Techy'],['jungle','Jungle / Breaks'],['depth','Discovery depth'],['experimental','Experimental bias'],['floor','Floor → Headphones'],['darkness','Darkness'],['breaks','Break density'],['count','Track count']];
let scope='base',draft=null,owner=null,revision=null,dirty=false,busy=false,message='',email='',codeSent=false;
let privatePlanEnabled=false, scheduleEdits={};
export function enablePrivatePlanUI(){privatePlanEnabled=true;}
const host=()=>document.querySelector('#personal-tuner');
function targetDate(){return privateDrops.plan?.next_drop_at?localDate(privateDrops.plan.next_drop_at):null;}
function oneTimeDefault(){
  const next=new Date(Math.ceil((Date.now()+60000)/3600000)*3600000);
  return {date:localDate(next),time:new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',hourCycle:'h23'}).format(next).padStart(2,'0')+':00'};
}
function adopt(){
  if(owner!==personal.user?.id){owner=personal.user?.id;scheduleEdits={};dirty=false;draft=null;scope='base';message='';}
  if(!dirty){draft=structuredClone(scope==='weekly'?(personal.state?.weekly_profile||personal.state?.base_profile||PERSONAL_DEFAULTS):(personal.state?.base_profile||PERSONAL_DEFAULTS));revision=personal.state?.revision||0;}
}
function capture(){
  if(!draft||!host())return;
  host().querySelectorAll('[data-personal-range]').forEach(x=>draft[x.dataset.personalRange]=Number(x.value));
  const past=host().querySelector('#personal-past');if(past)draft.searchPast=past.value;
  const mixes=host().querySelector('#personal-mixes');if(mixes)draft.mixes=mixes.checked;
}
export function renderPersonalTuner(){
  const el=host();if(!el)return;adopt();
  const onceDefault=oneTimeDefault();
  const signed=!!personal.user;
  const account=!personal.checked?'<p role="status">Checking personal account…</p>':personal.configured===null?'<p role="status">Personal account status could not be checked.</p><button type="button" data-personal="reload">Retry</button>':!personal.configured?'<p class="notice">Personal accounts are awaiting setup. Your current drop and device crate remain available.</p>':signed?`<p class="personal-account">${esc(personal.user.email)} <button type="button" data-personal="signout">Sign out</button></p>`:`<form data-personal-login><label for="personal-email">Sign in with email</label><input id="personal-email" type="email" autocomplete="email" required value="${esc(email)}">${codeSent?'<label for="personal-code">Email code</label><input id="personal-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required>':''}<button class="primary" type="submit" ${busy?'disabled':''}>${codeSent?'VERIFY CODE':'SEND SIGN-IN CODE'}</button>${codeSent?'<button type="button" data-personal="newcode">Use another email / resend</button>':''}<p class="notice">Private beta access. Your personal account is separate from publisher access.</p></form>`;
  const plan=`<section class="private-plan"><h3>MY WEEKLY DROP</h3><p>Choose a day and hour in Central time. Saving this plan also saves the taste you are editing.</p><div class="private-plan-row">
    <label>DAY<select id="private-weekday">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,i)=>`<option value="${i}" ${Number(scheduleEdits['private-weekday']??privateDrops.plan?.weekday??3)===i?'selected':''}>${day}</option>`).join('')}</select></label>
    <label>TIME<select id="private-time">${Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+':00').map(time=>`<option value="${time}" ${time===String(scheduleEdits['private-time']||privateDrops.plan?.local_time||'19:00').slice(0,5)?'selected':''}>${time}</option>`).join('')}</select></label></div>
    <button type="button" class="primary tuner-save" data-personal="plan">${busy?'SAVING…':'SAVE WEEKLY PLAN'}</button>
    ${privateDrops.plan?`<p class="private-plan-note">Next personal drop: ${esc(new Date(privateDrops.plan.next_drop_at).toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}))} CT</p>`:''}</section>`;
  const once=`<section class="private-plan"><h3>ONE TIME DIG</h3><p>Queue a personal drop without changing your weekly schedule. Save any taste edits first.</p><div class="private-plan-row"><label>DATE<input id="private-once-date" type="date" min="${localDate(new Date())}" value="${scheduleEdits['private-once-date']||onceDefault.date}"></label><label>TIME<select id="private-once-time">${Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+':00').map(time=>`<option value="${time}" ${time===(scheduleEdits['private-once-time']||onceDefault.time)?'selected':''}>${time}</option>`).join('')}</select></label></div><button type="button" data-personal="once">SCHEDULE ONE TIME DIG</button></section>`;
  const focus=`<section class="taste-section"><h3>DISCOVERY FOCUS</h3><div class="focus-chips focus-strip" role="group" aria-label="Release period"><button type="button" aria-pressed="true">Recent Releases</button><button type="button" disabled title="Archive source coverage is being validated">The Archives</button><button type="button" disabled title="Forthcoming-release coverage is being validated">Future</button></div>
    <label for="personal-past">Search the past</label><select id="personal-past">${[['1mo','1 month'],['3mo','3 months'],['6mo','6 months'],['1yr','1 year']].map(([v,l])=>`<option value="${v}" ${draft.searchPast===v?'selected':''}>${l}</option>`).join('')}</select>
    <div class="focus-chips focus-strip flags-strip" role="group" aria-label="Discovery focus">${[['labels','Label Specific'],['anthem','Anthem'],['groove','Groove'],['deep-dig','Deep Dig']].map(([v,l])=>`<button type="button" ${privatePlanEnabled&&['anthem','groove'].includes(v)?'disabled title="Audio traits are awaiting verified coverage"':''} data-focus="${v}" aria-pressed="${v==='labels'?draft.focus.labelSpecific:draft.focus.flags.includes(v)}">${l}</button>`).join('')}</div>
    ${privatePlanEnabled?'<p class="taste-hint">Archives, Future, Anthem and Groove need verified source or audio coverage before they can shape a dig.</p>':''}</section>`;
  const names=`<section class="taste-section"><h3>PREFERRED ARTISTS & LABELS</h3>${['artists','labels'].map(kind=>`<label for="taste-${kind}">Preferred ${kind}</label><div class="taste-chips">${draft[kind].map((name,i)=>`<button type="button" data-remove-name="${kind}" data-name-index="${i}" aria-label="Remove ${esc(name)}">${esc(name)} <span aria-hidden="true">×</span></button>`).join('')||'<span>No preferences yet</span>'}</div><div class="taste-add"><input id="taste-${kind}" maxlength="100" list="taste-${kind}-options" placeholder="Add a ${kind==='artists'?'preferred artist':'preferred label'}"><button type="button" data-add-name="${kind}">ADD</button></div><datalist id="taste-${kind}-options">${[...new Set(tracks.map(t=>kind==='artists'?t.artistName:t.label).filter(Boolean))].sort().map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>`).join('')}<p class="taste-hint">Names are preferences; suggestions come from the published catalog.</p></section>`;
  const fine=`<details class="personal-fine"><summary>Fine tune</summary>${sliders.map(([k,label])=>`<label class="range-label" for="personal-${k}">${label}<output>${draft[k]}</output></label><input id="personal-${k}" data-personal-range="${k}" class="range-input" type="range" min="${k==='count'?10:0}" max="${k==='count'?15:100}" value="${draft[k]}">`).join('')}<label class="check"><input type="checkbox" id="personal-mixes" ${privatePlanEnabled?'disabled':''} ${draft.mixes?'checked':''}>Include DJ mixes${privatePlanEnabled?' · awaiting verified mix sources':''}</label>${privatePlanEnabled?'<p class="taste-hint">Discovery depth and Experimental bias affect the available catalog. Floor → Headphones, Darkness and Break density are saved for future audio analysis; the current catalog has no verified values for those traits.</p>':''}</details>`;
  el.innerHTML=`<section class="personal-taste"><h3>MY TASTE</h3>${account}${message||personal.error?`<p role="status">${esc(message||personal.error)}</p>`:''}${signed?`
    <div class="tuner-tabs"><button type="button" data-personal-scope="base" aria-pressed="${scope==='base'}">Base</button><button type="button" data-personal-scope="weekly" aria-pressed="${scope==='weekly'}">This week</button></div>
    <p class="tuner-sync">${dirty?'UNSAVED PERSONAL EDITS':'PRIVATE PREFERENCES'}${scope==='weekly'?' · TARGET '+esc(targetDate()||'SAVE A WEEKLY PLAN FIRST'):''}</p>
    ${scope==='weekly'&&personal.state?.weekly_profile&&personal.state.target_date!==targetDate()?`<p class="taste-hint">Your previous override targeted ${esc(personal.state.target_date)}. It does not apply to this drop.</p>`:''}
    <fieldset ${busy?'disabled':''} class="tuner-fields">
    ${privatePlanEnabled?plan+once:''}${focus}${names}${fine}
    <div class="taste-actions"><button type="button" class="primary tuner-save" data-personal="save">SAVE ${scope==='base'?'DEFAULT TASTE':'THIS WEEK’S TASTE'}</button>${scope==='weekly'?'<button type="button" data-personal="clear">Use base taste this week</button>':''}<button type="button" data-personal="reload">Reload saved taste</button></div>
    </fieldset><details class="personal-data"><summary>History & privacy</summary><p>Saves are positive preferences. Heard is neutral. Unsaved tracks are not treated as dislikes.</p><label class="check"><input type="checkbox" id="personal-learning" ${personal.state?.learning_enabled?'checked':''} ${busy?'disabled':''}>Keep feedback for future taste learning</label><p class="notice">Learning is not active yet. Turning this off removes learning events while keeping your crate.</p><button type="button" data-personal="import">IMPORT THIS DEVICE’S SAVED / HEARD HISTORY</button><p class="notice">Import only your own history. Existing account choices win; local history stays available after sign-out.</p><button type="button" data-personal="export">EXPORT MY DATA</button><label for="personal-delete">Type DELETE MY TASTE to remove personal preferences and history</label><input id="personal-delete" autocomplete="off"><button type="button" data-personal="delete">DELETE MY TASTE DATA</button><p class="notice">This does not delete your sign-in account or this device’s guest history.</p></details>`:''}</section>`;
  if(!privatePlanEnabled)el.querySelectorAll('.private-plan').forEach(section=>section.remove());
}
async function operate(fn){if(busy)return;capture();busy=true;message='';renderPersonalTuner();try{await fn();}catch(e){message=e.message;}finally{busy=false;renderPersonalTuner();}}
export function setupPersonalTuner(){
  const dialog=document.querySelector('#tuner-dialog');
  window.addEventListener('personalchange',()=>{if(dialog.open)renderPersonalTuner();});
  dialog.addEventListener('submit',e=>{
    if(!e.target.matches('[data-personal-login]'))return;e.preventDefault();
    email=host().querySelector('#personal-email').value.trim();const code=host().querySelector('#personal-code')?.value;
    operate(async()=>{if(codeSent){await verifyCode(email,code);codeSent=false;}else{await sendCode(email);codeSent=true;message='Check your email for the verification code.';}});
  });
  dialog.addEventListener('input',e=>{
    if(e.target.id?.startsWith('private-'))scheduleEdits[e.target.id]=e.target.value;
    if(e.target.id==='personal-email')email=e.target.value;
    if(e.target.matches('[data-personal-range],#personal-past,#personal-mixes')){capture();dirty=true;const out=e.target.previousElementSibling?.querySelector('output');if(out)out.textContent=e.target.value;}
  });
  dialog.addEventListener('change',e=>{if(e.target.id?.startsWith('private-'))scheduleEdits[e.target.id]=e.target.value;if(e.target.id==='personal-learning'){const enabled=e.target.checked;operate(async()=>{await savePersonal({scope:'learning',enabled,expectedRevision:revision});revision=personal.state.revision;message='Learning history preference saved.';});}});
  dialog.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('#taste-artists,#taste-labels')){e.preventDefault();host().querySelector(`[data-add-name="${e.target.id.slice(6)}"]`).click();}});
  dialog.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||!host()?.contains(b)||busy)return;
    if(b.dataset.personalScope){capture();if(dirty){message='Save or reload your edits before switching tabs.';renderPersonalTuner();return;}scope=b.dataset.personalScope;renderPersonalTuner();return;}
    if(b.dataset.addName){capture();const kind=b.dataset.addName;try{draft[kind]=cleanNames([...draft[kind],host().querySelector('#taste-'+kind).value]);dirty=true;message='';}catch(e){message=e.message;}renderPersonalTuner();return;}
    if(b.dataset.removeName){capture();draft[b.dataset.removeName].splice(Number(b.dataset.nameIndex),1);if(!draft.labels.length)draft.focus.labelSpecific=false;dirty=true;renderPersonalTuner();return;}
    if(b.dataset.focus){capture();const v=b.dataset.focus;if(v==='labels'){if(!draft.labels.length){message='Add a preferred label first.';renderPersonalTuner();return;}draft.focus.labelSpecific=!draft.focus.labelSpecific;}else draft.focus.flags=draft.focus.flags.includes(v)?draft.focus.flags.filter(f=>f!==v):[...draft.focus.flags,v];dirty=true;renderPersonalTuner();return;}
    const action=b.dataset.personal;if(!action)return;
    // Capture values before rendering the busy state replaces the input nodes.
    const deletion=host().querySelector('#personal-delete')?.value;
    const planFields={weekday:Number(host().querySelector('#private-weekday')?.value),time:host().querySelector('#private-time')?.value};
    const onceFields={date:host().querySelector('#private-once-date')?.value,time:host().querySelector('#private-once-time')?.value};
    if(action==='newcode'){codeSent=false;message='';renderPersonalTuner();return;}
    operate(async()=>{
      if(action==='save'){if(scope==='weekly'&&!targetDate())throw Error('Save a weekly plan first so this taste has a scheduled target.');const profile=cleanPersonalProfile(draft);await savePersonal({scope,profile,targetDate:targetDate(),expectedRevision:revision});dirty=false;message=scope==='base'?'Default taste saved. Existing drops stay as published.':'This week’s taste saved for '+targetDate()+'.';}
      if(action==='plan'){const profile=cleanPersonalProfile(draft);
        await savePrivatePlan({scope,profile,...planFields,expectedRevision:revision});await loadPersonal();dirty=false;message='Weekly drop plan saved privately.';}
      if(action==='once'){if(dirty)throw Error('Save your taste or weekly plan before queuing this dig.');
        await requestOneTimeDig(onceFields);message='One Time Dig queued for '+onceFields.date+' at '+onceFields.time+' CT. Your weekly plan is unchanged.';}
      if(action==='clear'){await savePersonal({scope:'clear-weekly',expectedRevision:revision});dirty=false;message='Base taste will apply.';}
      if(action==='reload'){dirty=false;await loadPersonal();}
      if(action==='signout'){await signOut();dirty=false;}
      if(action==='import'){await importPersonalHistory(read('interactions',{}));message='Device history imported. Existing account choices were preserved.';}
      if(action==='export'){const data=await exportPersonal(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='drop-portal-personal-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      if(action==='delete'){await deletePersonal(deletion);await loadPrivateDrops();scheduleEdits={};dirty=false;message='Personal taste data deleted. Your sign-in account remains.';}
    });
  });
}
