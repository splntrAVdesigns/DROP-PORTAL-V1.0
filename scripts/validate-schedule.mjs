import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const file=path.join(root,'weekly-schedule','current.json');
const fail=(message)=>{console.error(`[schedule] FAIL: ${message}`);process.exitCode=1};

let schedule;
try{schedule=JSON.parse(fs.readFileSync(file,'utf8'))}
catch(error){fail(`weekly-schedule/current.json is not valid JSON: ${error.message}`);process.exit(1)}

const weekdays=new Set(['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']);
const hour=/^(?:[01]\d|2[0-3]):00$/;
const date=/^\d{4}-\d{2}-\d{2}$/;

if(schedule.schemaVersion!==1)fail('schemaVersion must equal 1');
if(schedule.timezone!=='America/Chicago')fail('timezone must equal America/Chicago');
if(!schedule.defaultSchedule||!weekdays.has(schedule.defaultSchedule.weekday))fail('defaultSchedule.weekday is invalid');
if(!hour.test(schedule.defaultSchedule?.time||''))fail('defaultSchedule.time must be a whole-hour HH:00 value');
if(!['armed','publishing','paused'].includes(schedule.status))fail('status must be armed, publishing, or paused');
if(typeof schedule.nextDropAt!=='string'||Number.isNaN(Date.parse(schedule.nextDropAt)))fail('nextDropAt must be a valid timestamp');
if(schedule.updatedAt!=null&&Number.isNaN(Date.parse(schedule.updatedAt)))fail('updatedAt must be a valid timestamp or null');
if(schedule.lastPublishedAt!=null&&Number.isNaN(Date.parse(schedule.lastPublishedAt)))fail('lastPublishedAt must be a valid timestamp or null');
if(schedule.override!=null){
  if(schedule.override.mode!=='one-off')fail('override.mode must be one-off');
  if(!date.test(schedule.override.date||''))fail('override.date must be YYYY-MM-DD');
  if(!hour.test(schedule.override.time||''))fail('override.time must be a whole-hour HH:00 value');
}
if(process.exitCode)process.exit(process.exitCode);
console.log(`[schedule] PASS: ${schedule.status} · next ${schedule.nextDropAt}`);
