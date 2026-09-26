import {personal,loadPersonal,sendCode,verifyCode,signOut,savePersonal,importPersonalHistory,exportPersonal,deletePersonal} from './personal.js';
import {PERSONAL_DEFAULTS,cleanPersonalProfile,cleanNames} from './personal-contracts.js';
import {read} from './storage.js';
import {tracks} from './data.js';
import {localDate} from './contracts.js';
import {scheduleState} from './schedule.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sliders=[['future','Future / Experimental'],['deep','Deep / Minimal / Techy'],['jungle','Jungle / Breaks'],['depth','Discovery depth'],['experimental','Experimental bias'],['floor','Floor → Headphones'],['darkness','Darkness'],['breaks','Break density'],['count','Track count']];
let scope='base',draft=null,owner=null,revision=null,dirty=false,busy=false,message='',email='',codeSent=false;
const host=()=>document.querySelector('#personal-tuner');
function targetDate(){return scheduleState.data?.nextDropAt?localDate(scheduleState.data.nextDropAt):localDate(new Date());}
function adopt(){
  if(owner!==personal.user?.id){owner=personal.user?.id;dirty=false;draft=null;scope='base';message='';}
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
  const signed=!!personal.user;
  const account=!personal.checked?'<p role="status">Checking personal account…</p>':personal.configured===null?'<p role="status">Personal account status could not be checked.</p><button type="button" data-personal="reload">Retry</button>':!personal.configured?'<p class="notice">Personal accounts are awaiting setup. Your current drop and device crate remain available.</p>':signed?`<p class="personal-account">${esc(personal.user.email)} <button type="button" data-personal="signout">Sign out</button></p>`:`<form data-personal-login><label for="personal-email">Sign in with email</label><input id="personal-email" type="email" autocomplete="email" required value="${esc(email)}">${codeSent?'<label for="personal-code">Email code</label><input id="personal-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required>':''}<button class="primary" type="submit" ${busy?'disabled':''}>${codeSent?'VERIFY CODE':'SEND SIGN-IN CODE'}</button>${codeSent?'<button type="button" data-personal="newcode">Use another email / resend</button>':''}<p class="notice">Private beta access. Your personal account is separate from publisher access.</p></form>`;
  el.innerHTML=`<section class="personal-taste"><h3>MY TASTE</h3>${account}${message||personal.error?`<p role="status">${esc(message||personal.error)}</p>`:''}${signed?`
    <div class="tuner-tabs"><button type="button" data-personal-scope="base" aria-pressed="${scope==='base'}">Base</button><button type="button" data-personal-scope="weekly" aria-pressed="${scope==='weekly'}">This week</button></div>
    <p class="tuner-sync">${dirty?'UNSAVED PERSONAL EDITS':'PRIVATE PREFERENCES'}${scope==='weekly'?' · TARGET '+esc(targetDate()):''}</p>
    ${scope==='weekly'&&personal.state?.weekly_profile&&personal.state.target_date!==targetDate()?`<p class="notice">Your previous override targeted ${esc(personal.state.target_date)}. It does not apply to this drop.</p>`:''}
    <fieldset ${busy?'disabled':''} class="tuner-fields">
    ${['artists','labels'].map(kind=>`<label for="taste-${kind}">Preferred ${kind}</label><div class="taste-chips">${draft[kind].map((name,i)=>`<button type="button" data-remove-name="${kind}" data-name-index="${i}" aria-label="Remove ${esc(name)}">${esc(name)} ×</button>`).join('')||'<span>No preferences yet</span>'}</div><div class="taste-add"><input id="taste-${kind}" maxlength="100" list="taste-${kind}-options" placeholder="Add a ${kind==='artists'?'preferred artist':'preferred label'}"><button type="button" data-add-name="${kind}">ADD</button></div><datalist id="taste-${kind}-options">${[...new Set(tracks.map(t=>kind==='artists'?t.artistName:t.label).filter(Boolean))].sort().map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>`).join('')}
    <p class="notice">Names are preferences, not verified identities. Suggestions come from the published catalog.</p>
    <h3>DISCOVERY FOCUS</h3><div class="focus-chips" role="group" aria-label="Release period"><button type="button" aria-pressed="true">Recent Releases</button><button type="button" disabled title="Archive source coverage is being validated">The Archives · soon</button><button type="button" disabled title="Forthcoming-release coverage is being validated">Future · soon</button></div>
    <label for="personal-past">Search the past</label><select id="personal-past">${[['1mo','1 month'],['3mo','3 months'],['6mo','6 months'],['1yr','1 year']].map(([v,l])=>`<option value="${v}" ${draft.searchPast===v?'selected':''}>${l}</option>`).join('')}</select>
    <div class="focus-chips" role="group" aria-label="Discovery focus">${[['labels','Label Specific'],['anthem','Anthem'],['groove','Groove'],['deep-dig','Deep Dig']].map(([v,l])=>`<button type="button" data-focus="${v}" aria-pressed="${v==='labels'?draft.focus.labelSpecific:draft.focus.flags.includes(v)}">${l}</button>`).join('')}</div>
    <p class="notice">Save your direction now. These private preferences connect to personal research in the next phase; the published drop is shared.</p>
    <details class="personal-fine"><summary>Fine tune</summary>${sliders.map(([k,label])=>`<label class="range-label" for="personal-${k}">${label}<output>${draft[k]}</output></label><input id="personal-${k}" data-personal-range="${k}" class="range-input" type="range" min="${k==='count'?10:0}" max="${k==='count'?15:100}" value="${draft[k]}">`).join('')}<label class="check"><input type="checkbox" id="personal-mixes" ${draft.mixes?'checked':''}>Include DJ mixes</label></details>
    <button type="button" class="primary tuner-save" data-personal="save">${busy?'SAVING…':'SAVE '+(scope==='base'?'BASE TASTE':'THIS WEEK’S TASTE')}</button>${scope==='weekly'?'<button type="button" data-personal="clear">Use base taste this week</button>':''}<button type="button" data-personal="reload">Reload saved taste</button>
    </fieldset><details class="personal-data"><summary>History & privacy</summary><p>Saves are positive preferences. Heard is neutral. Unsaved tracks are not treated as dislikes.</p><label class="check"><input type="checkbox" id="personal-learning" ${personal.state?.learning_enabled?'checked':''} ${busy?'disabled':''}>Keep feedback for future taste learning</label><p class="notice">Learning is not active yet. Turning this off removes learning events while keeping your crate.</p><button type="button" data-personal="import">IMPORT THIS DEVICE’S SAVED / HEARD HISTORY</button><p class="notice">Import only your own history. Existing account choices win; local history stays available after sign-out.</p><button type="button" data-personal="export">EXPORT MY DATA</button><label for="personal-delete">Type DELETE MY TASTE to remove personal preferences and history</label><input id="personal-delete" autocomplete="off"><button type="button" data-personal="delete">DELETE MY TASTE DATA</button><p class="notice">This does not delete your sign-in account or this device’s guest history.</p></details>`:''}</section>`;
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
    if(e.target.id==='personal-email')email=e.target.value;
    if(e.target.matches('[data-personal-range],#personal-past,#personal-mixes')){capture();dirty=true;const out=e.target.previousElementSibling?.querySelector('output');if(out)out.textContent=e.target.value;}
  });
  dialog.addEventListener('change',e=>{if(e.target.id==='personal-learning'){const enabled=e.target.checked;operate(async()=>{await savePersonal({scope:'learning',enabled,expectedRevision:revision});revision=personal.state.revision;message='Learning history preference saved.';});}});
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
    if(action==='newcode'){codeSent=false;message='';renderPersonalTuner();return;}
    operate(async()=>{
      if(action==='save'){const profile=cleanPersonalProfile(draft);await savePersonal({scope,profile,targetDate:targetDate(),expectedRevision:revision});dirty=false;message='Personal taste saved privately.';}
      if(action==='clear'){await savePersonal({scope:'clear-weekly',expectedRevision:revision});dirty=false;message='Base taste will apply.';}
      if(action==='reload'){dirty=false;await loadPersonal();}
      if(action==='signout'){await signOut();dirty=false;}
      if(action==='import'){await importPersonalHistory(read('interactions',{}));message='Device history imported. Existing account choices were preserved.';}
      if(action==='export'){const data=await exportPersonal(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='drop-portal-personal-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      if(action==='delete'){await deletePersonal(deletion);dirty=false;message='Personal taste data deleted. Your sign-in account remains.';}
    });
  });
}
