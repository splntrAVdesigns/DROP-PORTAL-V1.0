import test from 'node:test';
import assert from 'node:assert/strict';
import {personal} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal.js';
import {loadPrivateDrops,privateDrops,privateRequest} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-drops-client.js';
const response=data=>({ok:true,status:200,json:async()=>data});
test('late account A response cannot overwrite account B dashboard',async()=>{
  const oldFetch=globalThis.fetch;globalThis.window=new EventTarget();
  const pending=[];globalThis.fetch=()=>new Promise(resolve=>pending.push(resolve));
  try{
    personal.user={id:'A'};const a=loadPrivateDrops();
    personal.user={id:'B'};const b=loadPrivateDrops();
    pending[1](response({plan:{user_id:'B'},drops:[{id:'B-drop'}]}));await b;
    pending[0](response({plan:{user_id:'A'},drops:[{id:'A-drop'}]}));await a;
    assert.equal(privateDrops.owner,'B');assert.equal(privateDrops.drops[0].id,'B-drop');
    assert.equal(privateDrops.error,'');
  }finally{globalThis.fetch=oldFetch;delete globalThis.window;}
});
test('personal write never reports success after the account changes during the request',async()=>{
  const oldFetch=globalThis.fetch;let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
  try{
    personal.user={id:'A'};const request=privateRequest({method:'POST',body:'{}'});
    personal.user={id:'B'};finish(response({saved:true}));
    await assert.rejects(request,/account changed/);
  }finally{globalThis.fetch=oldFetch;}
});
