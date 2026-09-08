import test from 'node:test';import assert from 'node:assert/strict';import {validatePolicy} from '../apps/zhixing-worker/patrol.ts';
const p={enabled:true,intervalMinutes:30,weekdays:[1],startHour:0,endHour:24};
test('patrol bounds explicit scope and escalation threshold',()=>{for(const delta of [{orderIds:['']},{orderIds:Array(201).fill('A')},{orderIds:['A','A']},{escalationAfterHours:0},{escalationAfterHours:721}])assert.throws(()=>validatePolicy({...p,...delta}),/VALIDATION_ERROR/);validatePolicy({...p,orderIds:['A'],escalationAfterHours:24});});
