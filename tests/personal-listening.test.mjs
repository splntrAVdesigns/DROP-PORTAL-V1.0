import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {personalSignal} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-signal.js';
import {syncPersonalListening,setupPersonalListening,playPersonalPreview,stopPersonalListening,listeningState} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/personal-listening.js';
test('signal uses the completed snapshot and counts overlaps without fabricating matches',()=>{
 const result=personalSignal({result:{profileSnapshot:{artists:[' A '],labels:['L']},tracks:[{artistName:'A',label:'L',lane:0},{artistName:'B',label:'L',lane:1},{artistName:'C',lane:7}]}});
 assert.deepEqual(result.counts,[1,1,0,1]);assert.equal(result.artistMatches,1);assert.equal(result.labelMatches,2);
 assert.equal(result.total,3);assert.equal(personalSignal(null).total,0);
});
test('one listening owner survives refreshes, swaps providers and stops on account change',async()=>{
 const {window}=parseHTML('<html><body><button data-personal-preview="a"></button><button data-personal-preview="b"></button></body></html>');
 globalThis.window=window;globalThis.document=window.document;
 try{
  setupPersonalListening();const tracks=[{id:'a',artistName:'A',title:'A',preview:{kind:'provider-embed',provider:'BANDCAMP',embedUrl:'https://bandcamp.com/EmbeddedPlayer/track=1/'}},{id:'b',artistName:'B',title:'B',preview:{kind:'provider-embed',provider:'SOUNDCLOUD',embedUrl:'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fb%2Fc'}},{id:'evil',preview:{kind:'provider-embed',embedUrl:'https://evil.example/player/'}}];
  syncPersonalListening('A',tracks);await playPersonalPreview('a');const frame=document.querySelector('iframe');
  assert.equal(document.querySelectorAll('iframe').length,1);assert.equal(document.querySelector('[data-listening-toggle]').disabled,true);
  assert.equal(document.querySelector('.personal-listening-wave').querySelectorAll('rect').length,80);
  const {paletteMarkup}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/hero.js');
  const palettes=document.createElement('div');palettes.innerHTML=paletteMarkup();document.body.append(palettes);
  document.querySelector('[data-hero-palette="teal-coral"]').click();
  assert.equal(document.querySelector('#personal-listening-dock').style.getPropertyValue('--listening-color-a'),'#00F5C4');
  assert.equal(document.querySelector('iframe'),frame,'palette changes retain the provider iframe');
  assert.ok(document.querySelector('.personal-listening-head .personal-listening-note'));
  syncPersonalListening('A',structuredClone(tracks));assert.equal(document.querySelector('iframe'),frame);
  await playPersonalPreview('a');assert.equal(document.querySelector('iframe'),frame);
  document.querySelector('[data-listening-minimize]').click();assert.equal(document.querySelector('#personal-listening-dock').hidden,true);
  document.querySelector('#personal-listening-restore').click();assert.equal(document.querySelector('iframe'),frame);
  await playPersonalPreview('evil');assert.equal(document.querySelector('iframe'),frame);
  await playPersonalPreview('b');assert.equal(document.querySelectorAll('iframe').length,1);assert.notEqual(document.querySelector('iframe'),frame);
  syncPersonalListening('B',[]);assert.equal(document.querySelectorAll('iframe').length,0);assert.equal(listeningState().trackId,null);
  await playPersonalPreview('a');assert.equal(document.querySelectorAll('iframe').length,0);
  const create=document.createElement.bind(document);document.createElement=name=>{
    const node=create(name);if(name==='audio'){
      Object.assign(node,{paused:true,currentTime:0,duration:30,volume:0});
      node.play=async()=>{node.paused=false;node.dispatchEvent(new window.Event('playing'));};
      node.pause=()=>{node.paused=true;node.dispatchEvent(new window.Event('pause'));};node.load=()=>{};
    }return node;
  };
  const native=[{id:'n',artistName:'Native',title:'Authorized',preview:{kind:'direct-audio',provider:'OWNED',previewUrl:'/audio/test.wav'}}];
  syncPersonalListening('B',native);await playPersonalPreview('n');const audio=document.querySelector('audio');
  assert.equal(audio.paused,false);assert.equal(document.querySelector('[data-listening-toggle]').disabled,false);
  audio.currentTime=12;syncPersonalListening('B',native);assert.equal(document.querySelector('audio'),audio);assert.equal(audio.currentTime,12);
  const seek=document.querySelector('[data-listening-seek]');seek.value='20';seek.dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(audio.currentTime,20);
  const volume=document.querySelector('[data-listening-volume]');volume.value='.3';volume.dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(audio.volume,.3);
  document.querySelector('[data-listening-toggle]').click();assert.equal(audio.paused,true);
  syncPersonalListening(null);assert.equal(document.querySelector('audio'),null);assert.equal(audio.hasAttribute('src'),false);
 }finally{stopPersonalListening();delete globalThis.window;delete globalThis.document;}
});
