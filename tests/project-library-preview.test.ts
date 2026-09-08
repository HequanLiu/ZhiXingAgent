import test from 'node:test';
import assert from 'node:assert/strict';
import {previewProjectBatch} from './helpers/project.ts';
const p={id:'A',product:'speaker',customer:'customer',due:'2026-09-30',calendar:{weekdays:[1],holidays:[]},nodes:[{id:'a',name:'a',owner:'chen',due:'2026-09-30',weight:1,durationDays:1,dependencies:[],acceptanceCriteria:'ok'}]};
test('batch preview reports existing order conflicts with exact row numbers',()=>{
 const result=previewProjectBatch([p,{...p,id:'B'}],['B']);
 assert.equal(result.valid,false);assert.equal(result.errors.length,1);assert.equal(result.errors[0].row,2);assert.match(result.errors[0].code,/已存在/);
});
