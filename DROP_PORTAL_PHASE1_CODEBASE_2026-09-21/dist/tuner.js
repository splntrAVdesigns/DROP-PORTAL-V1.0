import {loadInquiry,saveInquiry,saveDropSettings} from './inquiry.js';
import {scheduleState,saveSchedule,formatNextDrop,nextDropFields,scheduleMode,scheduleLabel} from './schedule.js';
import {localDate} from './contracts.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=[['future','Future / Experimental'],['deep','Deep / Minimal / Techy'],['jungle','Jungle / Breaks / Leftfield'],['depth','Discovery depth'],['experimental','Experimental bias'],['floor','Floor → Headphones'],['darkness','Darkness'],['breaks','Break density'],['count','Track count']];
let scope='base',snapshot=null,drafts=null,scheduleDraft=null,busy=false,error='',conflict=false,dirty=false,epoch=0;
let onSaved=()=>{},notify=()=>{};
const dialog=()=>document.querySelector('#tuner-dialog');
const hourLabel=value=>{const h=Number(value.slice(0,2));return `${h%12||12}:00 ${h<12?'AM':'PM'}`;};
function capture(){
  if(!drafts)return;
  dialog().querySelectorAll('[data-pref]').forEach(x=>drafts[scope][x.dataset.pref]=Number(x.value));
  const mixes=dialog().querySelector('#mixes-enabled');if(mixes)drafts[scope].mixes=mixes.checked;
  for(const key of ['date','time','mode']){const input=dialog().querySelector('#schedule-'+key);if(input)scheduleDraft[key]=input.value;}
}
function adopt(result,keepDrafts=false){
  snapshot=result;
  if(!keepDrafts){drafts={base:{...result.inquiry.baseProfile},weekly:{...(result.inquiry.weeklyOverride||result.inquiry.baseProfile)}};dirty=false;}
  scheduleDraft={...nextDropFields(result.schedule),mode:scheduleMode(result.schedule)};
}
function render(){
  const d=dialog(),s=snapshot?.schedule,i=snapshot?.inquiry,p=drafts?.[scope],unconfigured=snapshot?.publisherConfigured===false;
  d.innerHTML=`<div class="drawer-head"><span>RECOMMENDATION TUNER</span><button data-close="tuner-dialog" aria-label="Close tuner">✕</button></div><h2>Tune your signal.</h2><p>Steer your next discovery session.</p>${unconfigured?'<p class="notice tuner-error" role="status">Production publisher saves are not enabled yet. Add the two server-side credentials under Vercel Project Settings → Environment Variables (Production), then redeploy. Your current dashboard settings have not been changed.</p>':''}${error?`<p class="notice tuner-error" role="alert">${esc(error)}</p><button data-tuner-reload>Reload saved settings</button>${conflict?'<button data-tuner-rebase>Keep my edits · load latest revision</button>':''}`:''}${!p?'<p role="status">'+(busy?'Loading publisher settings…':'Publisher settings unavailable. Retry to edit.')+'</p>':`
  <div class="tuner-tabs"><button data-tuner-scope="base" class="${scope==='base'?'active':''}">Base</button><button data-tuner-scope="weekly" class="${scope==='weekly'?'active':''}">This week</button></div>
  <p class="tuner-sync" role="status">${dirty?'UNSAVED EDITS':'SYNCED WITH PUBLISHER'} · TARGET ${esc(i.targetDropDate)}<br>${i.status==='queued'?'This week’s override is queued.':'Base profile will be used.'}</p>
  <p class="notice">These settings steer the next drop. Published drops keep their original profile. Lane values are relative priorities, not percentages.</p>
  <fieldset ${busy?'disabled':''} class="tuner-fields">${labels.map(([k,label])=>`<label class="range-label" for="tune-${k}">${label}<output id="out-${k}">${p[k]}</output></label><input class="range-input" id="tune-${k}" data-pref="${k}" type="range" min="${k==='count'?10:0}" max="${k==='count'?15:100}" value="${p[k]}">`).join('')}<label class="check"><input type="checkbox" id="mixes-enabled" ${p.mixes?'checked':''}>Include DJ mixes</label><button class="primary tuner-save" data-tuner-save ${unconfigured?'disabled title="Publisher credentials required"':''}>${busy?'SAVING…':'Save '+(scope==='base'?'base profile':'this week’s override')}</button>${scope==='weekly'?`<button class="tuner-save" data-tuner-clear ${unconfigured?'disabled title="Publisher credentials required"':''}>Use base profile this week</button>`:''}
  <section class="schedule-editor" aria-label="Drop schedule control"><div class="schedule-editor-head"><div><span>DROP SCHEDULE</span><small>Production publication control</small></div><em>WEEKLY · ${esc(s.defaultSchedule.weekday.slice(0,3))} ${hourLabel(s.defaultSchedule.time)} CT</em></div><div class="schedule-row"><label><span>DAY</span><input id="schedule-date" type="date" min="${localDate(new Date())}" value="${esc(scheduleDraft.date)}"></label><label><span>TIME</span><select id="schedule-time">${Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+':00').map(v=>`<option value="${v}" ${v===scheduleDraft.time?'selected':''}>${hourLabel(v)}</option>`).join('')}</select></label><label><span>MODE</span><select id="schedule-mode"><option value="one-off" ${scheduleDraft.mode==='one-off'?'selected':''}>This drop only</option><option value="weekly-default" ${scheduleDraft.mode==='weekly-default'?'selected':''}>Make weekly default</option></select></label><button class="primary schedule-save" data-tuner-combined ${unconfigured?'disabled title="Publisher credentials required"':''}>SAVE DROP SETTINGS</button></div><p class="schedule-armed">${esc(scheduleLabel())} · ${esc(formatNextDrop(s))}</p><p class="schedule-help">One save publishes this tab\'s preferences AND the selected schedule together. America/Chicago · hourly check; research follows.</p></section></fieldset>`}`;
  d.querySelectorAll('[data-tuner-scope],[data-tuner-reload],[data-tuner-rebase]').forEach(b=>b.disabled=busy);
}
async function reload(keep=false){
  if(busy)return;capture();busy=true;error='';conflict=false;render();
  const request=++epoch;
  try {const result=await loadInquiry();if(request!==epoch)return;const pendingSchedule=scheduleDraft;adopt(result,keep&&!!drafts);if(keep){scheduleDraft=pendingSchedule;dirty=true;}onSaved(result);}
  catch(e){error=e.message;}
  finally {if(request===epoch){busy=false;render();}}
}
export async function openTuner(){
  if(busy){dialog().showModal();return;}
  scope='base';snapshot=null;drafts=null;scheduleDraft=null;dirty=false;error='';conflict=false;
  if(!dialog().open)dialog().showModal();await reload();
}
async function withAdmin(operation){
  let key='';try{key=sessionStorage.getItem('drop_portal_schedule_admin')||''}catch{}
  try{return await operation(key)}catch(e){
    if(e.status!==401)throw e;
    key=window.prompt('DROP:PORTAL admin access code')||'';if(!key)throw Error('Save cancelled. Your edits are still here.');
    try{const result=await operation(key);try{sessionStorage.setItem('drop_portal_schedule_admin',key)}catch{}return result;}
    catch(retry){if(retry.status===401)try{sessionStorage.removeItem('drop_portal_schedule_admin')}catch{}throw retry;}
  }
}
async function save(kind){
  if(busy||!snapshot)return;capture();if(snapshot.publisherConfigured===false){error='Production publisher credentials must be configured and redeployed before saving.';render();return;}const expectedRevision=snapshot.revision;
  busy=true;error='';conflict=false;render();
  try{
    const result=await withAdmin(adminKey=>kind==='combined'?saveDropSettings({...scheduleDraft,scope,profile:drafts[scope],adminKey,expectedRevision}):kind==='schedule'?saveSchedule({...scheduleDraft,adminKey,expectedRevision}):saveInquiry({scope,profile:drafts[scope],clear:kind==='clear',adminKey,expectedRevision}));
    // A schedule save must not discard unrelated unsaved sliders. Likewise,
    // saving one profile must not erase the other tab or a pending date edit.
    const pendingSchedule={...scheduleDraft};
    if(kind==='schedule'||kind==='combined')adopt(result,true);
    else {snapshot=result;if(kind==='clear')drafts.weekly={...result.inquiry.baseProfile};scheduleDraft=pendingSchedule;}
    dirty=JSON.stringify(drafts.base)!==JSON.stringify(result.inquiry.baseProfile)||JSON.stringify(drafts.weekly)!==JSON.stringify(result.inquiry.weeklyOverride||result.inquiry.baseProfile);
    onSaved(result);notify(kind==='combined'?'Drop preferences + schedule saved together':kind==='schedule'?'Schedule saved · inquiry date synchronized':'Tuner settings synced to publisher');
  }catch(e){error=e.message;conflict=e.status===409;}
  finally{busy=false;render();}
}
export function setupTuner(options){
  onSaved=options.onSaved;notify=options.toast;
  dialog().addEventListener('input',e=>{if(e.target.matches('[data-pref],#mixes-enabled')){dirty=true;const output=dialog().querySelector('#out-'+e.target.dataset.pref);if(output)output.textContent=e.target.value;const status=dialog().querySelector('.tuner-sync');if(status)status.textContent='UNSAVED EDITS · TARGET '+snapshot.inquiry.targetDropDate;}});
  dialog().addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;
    if(b.dataset.tunerScope){capture();scope=b.dataset.tunerScope;render();}
    if(b.hasAttribute('data-tuner-reload'))reload();
    if(b.hasAttribute('data-tuner-rebase'))reload(true);
    if(b.hasAttribute('data-tuner-save'))save('profile');
    if(b.hasAttribute('data-tuner-clear'))save('clear');
    if(b.hasAttribute('data-tuner-combined'))save('combined');
  });
}
