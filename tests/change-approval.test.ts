import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChangeInput} from './helpers/changes.ts';
const valid={orderId:'A26-018',sourceVersion:1,due:'2026-10-01',extraCostCents:0,reason:'客户已确认'};
test('bounded proposal rejects unknown fields and invalid money, dates, versions and reasons',()=>{
 for(const input of [null,[],{}, {...valid,sourceVersion:0},{...valid,sourceVersion:1.5},{...valid,extraCostCents:-1},{...valid,extraCostCents:Number.MAX_SAFE_INTEGER+1},{...valid,extraCostCents:'100'}, {...valid,due:'2026-02-29'},{...valid,reason:' '},{...valid,reason:'x'.repeat(501)},{...valid,orderId:''},{...valid,writeTool:'arbitrary'}])assert.throws(()=>validateChangeInput(input),/^Error: VALIDATION_ERROR$/);
 assert.deepEqual(validateChangeInput(valid),valid);
 const result=validateChangeInput(valid);result.due='2026-12-01';assert.equal(valid.due,'2026-10-01');
});
