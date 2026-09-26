import test from 'node:test';
import assert from 'node:assert/strict';
import {bandcampPage,bandcampPreview,resolveBandcampTracks} from '../lib/preview-resolver.js';
import {embedPreview} from '../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/destinations.js';
const track={id:'track-1',title:'Black Bridge (Remix)',artistName:'Eckom',links:[{url:'https://omnimusic.bandcamp.com/album/mindstate-ep'}]};
const record={artist:'Eckom',trackinfo:[{track_id:697941044,title:track.title,streaming:1}]};
const page=data=>'<script data-tralbum="'+JSON.stringify(data).replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></script>';
test('Bandcamp resolution verifies exact artist and title and refuses ambiguous or disabled streams',()=>{
  const resolve=d=>bandcampPreview(page(d),track,track.links[0].url);
  assert.match(resolve(record).preview.embedUrl,/track=697941044/);
  assert.equal(resolve({...record,artist:'Another artist'}),null);
  assert.equal(resolve({...record,trackinfo:[{...record.trackinfo[0],title:'Black Bridge VIP'}]}),null);
  assert.equal(resolve({...record,trackinfo:[...record.trackinfo,...record.trackinfo]}),null);
  assert.equal(resolve({...record,trackinfo:[{...record.trackinfo[0],streaming:0}]}),null);
});
test('source fetches use bounded official URLs, no redirects, and reuse shared album pages',async()=>{
  for(const url of ['https://evil.test/album/x','https://x.bandcamp.com.evil.test/track/x','https://user@x.bandcamp.com/track/x','https://x.bandcamp.com:8443/track/x'])assert.equal(bandcampPage(url),null);
  let calls=0;
  const result=await resolveBandcampTracks([track,{...track,id:'track-2'}],{fetcher:async(url,options)=>{
    calls++;assert.equal(options.redirect,'error');return {ok:true,text:async()=>page(record)};
  }});
  assert.equal(calls,1);assert.equal(result.results.length,2);
  assert.equal(JSON.stringify(result).includes('mp3'),false);
});
test('browser embeds allow only matching official player hosts and retain safe fallbacks',()=>{
  assert.equal(embedPreview({preview:{kind:'provider-embed',provider:'BANDCAMP',embedUrl:'https://evil.test/EmbeddedPlayer/track=1/'}}),null);
  assert.equal(embedPreview({preview:{kind:'provider-embed',provider:'SOUNDCLOUD',embedUrl:'https://w.soundcloud.com.evil.test/player/'}}),null);
  assert.equal(embedPreview({links:[{kind:'listen',url:'https://soundcloud.com/artist/track'}]}).provider,'SOUNDCLOUD');
  assert.equal(embedPreview({links:[{kind:'listen',url:'https://www.mixcloud.com/artist/show/'}]}).provider,'MIXCLOUD');
});
