import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const dist='DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist';
const required=['index.html','app.js','data.js','feed.js','feed-refresh.js','player.js','storage.js','schedule.js','inquiry.js','tuner.js','hero.js','interactions.js','contracts.js','styles.css','phase16.css','hero.css'];
for(const file of required)if(!fs.existsSync(path.join(dist,file)))throw Error('Missing asset: '+file);
for(const dir of [dist,'api','lib'])for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))){
  const target=path.join(dir,file),result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
  for(const [,specifier] of fs.readFileSync(target,'utf8').matchAll(/from\s*['"](\.[^'"]+)['"]/g))if(!fs.existsSync(path.resolve(dir,specifier)))throw Error(`Missing import in ${target}: ${specifier}`);
}
if(fs.readFileSync('lib/contracts.js','utf8')!==fs.readFileSync(path.join(dist,'contracts.js'),'utf8'))throw Error('Browser/server contracts differ');
for(const [file,needle] of [
  ['api/drop-settings.js','writeState(state,{schedule,inquiry}'],
  [path.join(dist,'tuner.js'),'data-tuner-combined'],
  [path.join(dist,'inquiry.js'),"'/api/drop-settings'"],
  ['lib/repository.js','publisherConfigured']
]){
  if(!fs.readFileSync(file,'utf8').includes(needle))throw Error('Missing combined publisher save contract: '+file);
}
console.log('[shell] PASS: assets, syntax, imports, shared contracts, combined save');
