import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validHour,validDate,validSchedule,scheduleInstant,nextWeekly} from '../lib/contracts.js';
const schedule=JSON.parse(fs.readFileSync('weekly-schedule/current.json'));
test('all 24 valid hours are accepted by shared contract',()=>{
  for(let h=0;h<24;h++)assert.ok(validHour(String(h).padStart(2,'0')+':00'));
  for(const bad of ['24:00','19:30','1d:00','7:00',null])assert.equal(validHour(bad),false);
  assert.ok(validSchedule(schedule));
});
test('invalid dates and nonexistent Chicago hours are rejected',()=>{
  assert.equal(validDate('2027-02-29'),false);assert.equal(validDate('2028-02-29'),true);
  assert.throws(()=>scheduleInstant('2027-03-14','02:00'));
  assert.equal(scheduleInstant('2026-09-23','19:00').toISOString(),'2026-09-24T00:00:00.000Z');
  assert.equal(scheduleInstant('2026-11-01','01:00').toISOString(),'2026-11-01T06:00:00.000Z');
});
test('weekly rollover handles winter offset and same-day one-off completion',()=>{
  assert.equal(nextWeekly({weekday:'WEDNESDAY',time:'19:00'},new Date('2026-10-29T00:05:00Z')).toISOString(),'2026-11-05T01:00:00.000Z');
  assert.equal(nextWeekly({weekday:'WEDNESDAY',time:'19:00'},new Date('2026-09-23T14:00:00Z')).toISOString(),'2026-09-24T00:00:00.000Z');
});
test('browser accepts valid API state and displays errors truthfully',async()=>{
  const inquiry=JSON.parse(fs.readFileSync('weekly-inquiry/current.json'));
  const {loadSchedule,scheduleState,scheduleLabel}=await import('../DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/schedule.js');
  globalThis.fetch=async()=>({ok:true,json:async()=>({schedule,inquiry,revision:'a'.repeat(40)})});
  assert.equal(await loadSchedule(),true);assert.equal(scheduleState.data.nextDropAt,schedule.nextDropAt);
  globalThis.fetch=async()=>({ok:false,status:502,json:async()=>({message:'Unavailable'})});
  assert.equal(await loadSchedule(),false);assert.equal(scheduleLabel(),'SCHEDULE UNAVAILABLE');
});
