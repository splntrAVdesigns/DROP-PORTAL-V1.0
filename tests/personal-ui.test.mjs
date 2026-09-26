import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

test('compact Tuner saves private artist/label focus, protects unsaved tabs and resets after account change',async()=>{
  const {window,document}=parseHTML('<html><body><dialog id="tuner-dialog" open><div id="personal-tuner"></div></dialog></body></html>');
  Object.defineProperty(window.HTMLInputElement.prototype,'checked',{get(){return this.hasAttribute('checked');},set(v){this.toggleAttribute('checked',!!v);},configurable:true});
  globalThis.window=window;globalThis.document=document;
  const {personal}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal.js');
  const {PERSONAL_DEFAULTS}=await import('../lib/personal-contracts.js');
  const {renderPersonalTuner,setupPersonalTuner}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-tuner.js');
  Object.assign(personal,{checked:true,configured:true,user:{id:'user-a',email:'a@example.com'},state:{base_profile:structuredClone(PERSONAL_DEFAULTS),weekly_profile:null,target_date:null,revision:0,learning_enabled:false}});
  const requests=[];const oldFetch=globalThis.fetch;
  globalThis.fetch=async(path,options)=>{
    const data=JSON.parse(options.body);requests.push({path,...data,headers:options.headers});
    return {ok:true,status:200,json:async()=>({state:{...personal.state,base_profile:data.profile,revision:1}})};
  };
  try{
    setupPersonalTuner();renderPersonalTuner();
    assert.equal(document.querySelector('.personal-fine').hasAttribute('open'),false);
    assert.equal(document.querySelectorAll('.focus-chips button[disabled]').length,2);
    document.querySelector('[data-focus=labels]').click();
    assert.match(document.querySelector('#personal-tuner').textContent,/Add a preferred label first/);
    document.querySelector('#taste-labels').value='Metalheadz';document.querySelector('[data-add-name=labels]').click();
    document.querySelector('#taste-artists').value='Photek';document.querySelector('[data-add-name=artists]').click();
    document.querySelector('[data-focus=labels]').click();document.querySelector('[data-focus=groove]').click();
    document.querySelector('[data-personal-scope=weekly]').click();
    assert.match(document.querySelector('#personal-tuner').textContent,/Save or reload your edits/);
    document.querySelector('[data-personal=save]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(requests.length,1,document.querySelector('#personal-tuner').textContent);assert.equal(requests[0].path,'/api/personal-data');
    assert.equal(requests[0].headers['X-Personal-Account'],'user-a');
    assert.equal(requests[0].scope,'base');assert.deepEqual(requests[0].profile.labels,['Metalheadz']);
    assert.equal(requests[0].profile.focus.labelSpecific,true);assert.deepEqual(requests[0].profile.focus.flags,['groove']);
    assert.equal(requests[0].expectedRevision,0);
    Object.assign(personal,{user:{id:'user-b',email:'b@example.com'},state:{base_profile:structuredClone(PERSONAL_DEFAULTS),weekly_profile:null,revision:0}});
    renderPersonalTuner();assert.equal(document.querySelector('.taste-chips').textContent.includes('Photek'),false);
  }finally{globalThis.fetch=oldFetch;delete globalThis.window;delete globalThis.document;}
});
