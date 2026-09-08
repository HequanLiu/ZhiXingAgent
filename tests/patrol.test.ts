import test from 'node:test';import assert from 'node:assert/strict';
import {validatePolicy,isPatrolWindow} from '../apps/zhixing-worker/patrol.ts';
const p={enabled:true,intervalMinutes:30,weekdays:[1,2,3,4,5],startHour:9,endHour:18};
test('patrol policy validates bounded interval and Shanghai business window',()=>{
  validatePolicy(p);assert.equal(isPatrolWindow(p,new Date('2026-09-07T01:00:00Z')),true);
  assert.equal(isPatrolWindow(p,new Date('2026-09-07T10:00:00Z')),false);
  assert.equal(isPatrolWindow(p,new Date('2026-09-06T01:00:00Z')),false);
  for(const change of [{intervalMinutes:0},{intervalMinutes:1.5},{weekdays:[]},{startHour:19,endHour:18},{enabled:'yes'}])assert.throws(()=>validatePolicy({...p,...change}),/VALIDATION_ERROR/);
});
