import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {clampPlayerPosition,setupPlayerPosition} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/listening-position.js';
test('desktop player stays inside viewport and moving it preserves its iframe',()=>{
 const {window}=parseHTML('<html><body><section><div data-listening-drag tabindex="0"></div><button data-listening-reset-position></button><iframe></iframe></section></body></html>');
 globalThis.window=window;globalThis.document=window.document;globalThis.matchMedia=()=>({matches:true});
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 window.innerWidth=1200;window.innerHeight=700;
 const node=document.querySelector('section'),frame=document.querySelector('iframe');node.getBoundingClientRect=()=>({left:300,top:450,width:500,height:160});
 const cleanup=setupPlayerPosition(node,'A');
 try{
  const dispatch=(type,props)=>{const event=new window.Event(type,{bubbles:true});Object.assign(event,props);node.querySelector('[data-listening-drag]').dispatchEvent(event);};
  dispatch('pointerdown',{button:0,pointerId:1,clientX:300,clientY:450});dispatch('pointermove',{pointerId:1,clientX:2000,clientY:1500});dispatch('pointerup',{pointerId:1});
  assert.equal(node.style.left,'692px');assert.equal(node.style.top,'532px');assert.equal(document.querySelector('iframe'),frame);
  assert.ok(values.size);cleanup();node.classList.remove('is-floating');
  const cleanupB=setupPlayerPosition(node,'B');assert.equal(node.classList.contains('is-floating'),false,'second account has no saved position');cleanupB();
  assert.deepEqual(clampPlayerPosition({x:-100,y:2000},{width:900,height:600},{width:500,height:100}),{x:8,y:492});
 }finally{cleanup();delete globalThis.window;delete globalThis.document;delete globalThis.matchMedia;delete globalThis.localStorage;}
});
