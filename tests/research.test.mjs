import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRegistry,normalizeMusicBrainz,normalizeSoundCloud,discoverSource,mergeQueue} from '../lib/research.js';
import {soundCloudTokenForRun} from '../lib/research-runtime.js';

const now=new Date('2026-09-25T12:00:00Z');
const mb={id:'12345678-1234-1234-1234-123456789abc',title:'Signal (Original Mix)',
  'artist-credit':[{name:'Small Label Artist'}],'first-release-date':'2026-09-20',releases:[{title:'Signal EP'}]};
const sc={id:2833445577,title:'Signal (Original Mix)',metadata_artist:'Small Label Artist',
  created_at:'2026-09-21T13:00:00Z',genre:'Drum & Bass',permalink_url:'https://soundcloud.com/smalllabel/signal'};
const mbSource={id:'mb-underground',kind:'musicbrainz-recordings',name:'MB',enabled:true,
  queries:['jungle'],limitPerQuery:10};
const scSource={id:'sc-underground',kind:'soundcloud-tracks',name:'SC',enabled:true,
  queries:['jungle'],limitPerQuery:10};

test('registry permits bounded source queries and rejects unapproved adapter kinds',()=>{
  assert.equal(validateRegistry({schemaVersion:1,sources:[mbSource,scSource]}).sources.length,2);
  assert.throws(()=>validateRegistry({schemaVersion:1,sources:[{...mbSource,kind:'arbitrary-http'}]}),/Invalid research source/);
  assert.throws(()=>validateRegistry({schemaVersion:1,sources:[mbSource,mbSource]}),/Invalid research source/);
});
test('real provider shapes retain evidence without asserting unheard audio or false dates',()=>{
  const a=normalizeMusicBrainz(mb,mbSource,now),b=normalizeSoundCloud(sc,scSource,now);
  assert.equal(a.releaseDate,'2026-09-20');
  assert.equal(a.preview,null);
  assert.ok(a.flags.includes('audio_not_assessed'));
  assert.equal(b.releaseDate,null);
  assert.equal(b.uploadedAt,'2026-09-21');
  assert.ok(b.flags.includes('release_date_unverified'));
  assert.equal(b.evidence[0].url,sc.permalink_url);
  assert.equal(normalizeMusicBrainz({...mb,'first-release-date':'2022-01-01'},mbSource,now),null);
  assert.equal(normalizeSoundCloud({...sc,permalink_url:'https://localhost/private'},scSource,now),null);
});
test('adapters use official endpoints, never manufacture missing credentials',async()=>{
  const visited=[];
  const fetcher=async(url,options)=>{
    visited.push([url.toString(),options.headers]);
    return {ok:true,text:async()=>JSON.stringify(url.hostname==='musicbrainz.org'?{recordings:[mb]}:[sc])};
  };
  const mbResult=await discoverSource(mbSource,{fetcher,now,throttleMs:0});
  const scMissing=await discoverSource(scSource,{fetcher,now,soundcloudToken:''});
  const scResult=await discoverSource(scSource,{fetcher,now,soundcloudToken:'test-token'});
  assert.equal(mbResult.candidates.length,1);
  assert.equal(scMissing.state,'needs_credentials');
  assert.equal(scResult.candidates.length,1);
  assert.equal(visited.length,4);
  assert.match(visited[0][0],/^https:\/\/musicbrainz\.org\/ws\/2\/recording\//);
  assert.match(visited[2][0],/^https:\/\/api\.soundcloud\.com\/tracks\?/);
  assert.equal(visited[3][1].Authorization,'OAuth test-token');
});
test('queue merges cross-source evidence and preserves reviewer decisions on rerun',()=>{
  const a=normalizeMusicBrainz(mb,mbSource,now),b=normalizeSoundCloud(sc,scSource,now);
  const empty={schemaVersion:1,updatedAt:null,candidates:[],runs:[]};
  const first=mergeQueue(empty,[a,b],now);
  assert.equal(first.added,1);
  assert.equal(first.matched,1);
  assert.equal(first.queue.candidates[0].evidence.length,2);
  first.queue.candidates[0].reviewStatus='rejected';
  const again=mergeQueue(first.queue,[b],new Date(now.getTime()+3600000));
  assert.equal(again.added,0);
  assert.equal(again.queue.candidates[0].reviewStatus,'rejected');
  assert.equal(again.queue.candidates[0].evidence.length,2);
  assert.equal(again.queue.candidates[0].releaseDate,'2026-09-20');
});
test('SoundCloud obtains a server-only client credentials token once per run',async()=>{
  const oldId=process.env.SOUNDCLOUD_CLIENT_ID,oldSecret=process.env.SOUNDCLOUD_CLIENT_SECRET,
    oldToken=process.env.SOUNDCLOUD_ACCESS_TOKEN;
  delete process.env.SOUNDCLOUD_ACCESS_TOKEN;
  process.env.SOUNDCLOUD_CLIENT_ID='test-id';process.env.SOUNDCLOUD_CLIENT_SECRET='test-secret';
  try{
    const token=await soundCloudTokenForRun(async(url,options)=>{
      assert.equal(url,'https://secure.soundcloud.com/oauth/token');
      assert.equal(options.method,'POST');
      assert.equal(options.headers.Authorization,'Basic '+Buffer.from('test-id:test-secret').toString('base64'));
      assert.equal(options.body,'grant_type=client_credentials');
      return {ok:true,json:async()=>({access_token:'transient-token'})};
    });
    assert.equal(token,'transient-token');
  }finally{
    for(const [key,value] of Object.entries({SOUNDCLOUD_CLIENT_ID:oldId,SOUNDCLOUD_CLIENT_SECRET:oldSecret,SOUNDCLOUD_ACCESS_TOKEN:oldToken})){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
