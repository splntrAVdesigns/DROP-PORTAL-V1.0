import test from 'node:test';
import assert from 'node:assert/strict';
import {issuePublisherSession,validPublisherSession,sameOrigin} from '../lib/publisher-session.js';
import {authorize} from '../lib/repository.js';
import adminHandler from '../api/admin-session.js';

const host='drop-portal-v1-0.vercel.app';
const origin='https://'+host;
const key='test-only-strong-admin-passphrase';
function req(method='POST',headers={},body={}){
  return {method,headers:{host,origin,...headers},body};
}
function response(){
  let status=200,body={},headers={};
  return {
    status(code){status=code;return this;},
    setHeader(name,value){headers[String(name).toLowerCase()]=value;return this;},
    json(value){body=value;return this;},
    get result(){return {status,body,headers};}
  };
}
function extractCookie(header){return header.split(';')[0];}

test('publisher session uses signed HttpOnly Strict cookie, not browser-readable key',()=>{
  const header=issuePublisherSession(key);
  assert.match(header,/HttpOnly/);
  assert.match(header,/SameSite=Strict/);
  assert.match(header,/Secure/);
  assert.match(header,/Max-Age=28800/);
  assert.ok(!header.includes(key));
  const cookie=extractCookie(header);
  assert.equal(validPublisherSession(req('POST',{cookie}),key),true);
  assert.equal(validPublisherSession(req('GET',{cookie,origin:undefined}),key),true);
  assert.equal(validPublisherSession(req('POST',{cookie,origin:'https://evil.example'}),key),false);
  assert.equal(validPublisherSession(req('POST',{cookie:cookie+'tampered'}),key),false);
  assert.equal(validPublisherSession(req('POST',{cookie}),key+'-wrong'),false);
  assert.equal(sameOrigin(req('POST',{origin:'https://evil.example'})),false);
});

test('masked unlock API issues session and allows explicit lock without returning secrets',()=>{
  const before={admin:process.env.DROP_PORTAL_ADMIN_KEY,token:process.env.GITHUB_TOKEN};
  process.env.DROP_PORTAL_ADMIN_KEY=key;
  process.env.GITHUB_TOKEN='test-only-github-token';
  try{
    const wrong=response();
    adminHandler(req('POST',{}, {adminKey:'bad'}),wrong);
    assert.equal(wrong.result.status,401);
    assert.equal(wrong.result.headers['set-cookie'],undefined);
    const unlock=response();
    adminHandler(req('POST',{}, {adminKey:key}),unlock);
    assert.equal(unlock.result.status,200);
    assert.deepEqual(unlock.result.body,{unlocked:true,sessionHours:8});
    assert.ok(!JSON.stringify(unlock.result).includes(key));
    const cookie=extractCookie(unlock.result.headers['set-cookie']);
    const check=response();
    adminHandler(req('GET',{cookie,origin:undefined}),check);
    assert.equal(check.result.body.unlocked,true);
    const locked=response();
    adminHandler(req('DELETE',{cookie}),locked);
    assert.equal(locked.result.status,200);
    assert.equal(locked.result.body.unlocked,false);
    assert.match(locked.result.headers['set-cookie'],/Max-Age=0/);
    const cross=response();
    adminHandler(req('POST',{origin:'https://evil.example'},{adminKey:key}),cross);
    assert.equal(cross.result.status,403);
  }finally{
    before.admin===undefined?delete process.env.DROP_PORTAL_ADMIN_KEY:process.env.DROP_PORTAL_ADMIN_KEY=before.admin;
    before.token===undefined?delete process.env.GITHUB_TOKEN:process.env.GITHUB_TOKEN=before.token;
  }
});

test('existing publisher write endpoints accept only signed same-origin session or correct admin header',()=>{
  const previous={admin:process.env.DROP_PORTAL_ADMIN_KEY,token:process.env.GITHUB_TOKEN};
  process.env.DROP_PORTAL_ADMIN_KEY=key;
  process.env.GITHUB_TOKEN='test-only-github-token';
  try{
    const cookie=extractCookie(issuePublisherSession(key));
    assert.doesNotThrow(()=>authorize(req('POST',{cookie})));
    assert.throws(()=>authorize(req('POST',{cookie,origin:'https://evil.example'})),{status:401});
    assert.throws(()=>authorize(req('POST',{cookie:cookie+'changed'})),{status:401});
    assert.doesNotThrow(()=>authorize(req('POST',{'x-drop-portal-admin-key':key})));
  }finally{
    previous.admin===undefined?delete process.env.DROP_PORTAL_ADMIN_KEY:process.env.DROP_PORTAL_ADMIN_KEY=previous.admin;
    previous.token===undefined?delete process.env.GITHUB_TOKEN:process.env.GITHUB_TOKEN=previous.token;
  }
});
