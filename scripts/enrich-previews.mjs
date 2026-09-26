import {readFile,writeFile} from 'node:fs/promises';
import {resolveBandcampTracks} from '../lib/preview-resolver.js';
const root=new URL('../weekly-feed/drops/',import.meta.url);
const index=JSON.parse(await readFile(new URL('index.json',root),'utf8'));
const entry=index.drops.find(d=>d.status==='published');
if(!entry||!/^\.\/[\w.-]+\.json$/.test(entry.url))throw Error('Invalid latest drop');
const payload=JSON.parse(await readFile(new URL(entry.url,root),'utf8'));
const previous=entry.enrichmentUrl?JSON.parse(await readFile(new URL(entry.enrichmentUrl,root),'utf8')):null;
const existing=new Set((previous?.tracks||[]).map(t=>t.id));
const {results,unresolved}=await resolveBandcampTracks(payload.tracks.filter(t=>!existing.has(t.id)));
console.log(JSON.stringify({dropId:entry.id,resolved:results.length,unresolved,dryRun:!process.argv.includes('--write')}));
if(results.length&&process.argv.includes('--write')){
  const path=entry.url.replace(/\.json$/,'.enrichment.json');
  await writeFile(new URL(path,root),JSON.stringify({schemaVersion:1,dropId:entry.id,sourcePayload:entry.url,verifiedAt:new Date().toISOString().slice(0,10),tracks:[...(previous?.tracks||[]),...results]},null,2)+'\n');
  entry.enrichmentUrl=path;index.updatedAt=new Date().toISOString();
  await writeFile(new URL('index.json',root),JSON.stringify(index,null,2)+'\n');
}
