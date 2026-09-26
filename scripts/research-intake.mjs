import {runResearch} from '../lib/research-runtime.js';
const dryRun=process.argv.includes('--dry-run');
runResearch({dryRun}).then(result=>{
  console.log(JSON.stringify(result));
  if(result.sources.every(s=>s.state==='error'||s.state==='needs_credentials'||s.state==='partial'&&s.count===0))process.exitCode=2;
}).catch(error=>{console.error('RESEARCH_INTAKE_FAILURE '+error.message);process.exitCode=1;});
