import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFeedback,createOrders} from './helpers/domain.ts';
test('percentage feedback records its unit and expected finish evidence',()=>{
  const order=createOrders()[0];
  const result=applyFeedback(order,{nodeId:'assembly',expectedVersion:1,mode:'percent',percent:72,expectedFinish:'2026-09-13',materialEta:'2026-09-10'},'zhao');
  assert.equal(result.nodes[3].percent,72);assert.equal(result.nodes[3].expectedFinish,'2026-09-13');assert.equal(result.feedback[0].mode,'percent');
  assert.equal(result.feedback[0].materialEta,'2026-09-10');
});
test('invalid evidence dates, mixed units and out of range percentages are rejected',()=>{
  const order=createOrders()[0];
  for(const input of [{mode:'percent',percent:101},{mode:'percent',percent:20,total:20,completed:4},{completed:10,total:20,expectedFinish:'2026-02-30'},{completed:10,total:20,materialEta:'yesterday'}])
    assert.throws(()=>applyFeedback(order,{nodeId:'assembly',expectedVersion:1,...input} as any,'zhao'),/VALIDATION_ERROR/);
});

test('new blocker invalidates old estimates while preserving their feedback evidence',()=>{
  const original=createOrders()[0];
  const first=applyFeedback(original,{nodeId:'assembly',expectedVersion:1,mode:'percent',percent:20,expectedFinish:'2026-09-13',materialEta:'2026-09-10'},'zhao');
  const next=applyFeedback(first,{nodeId:'assembly',expectedVersion:2,mode:'percent',percent:20,blocker:'new shortage'},'zhao');
  assert.equal(next.nodes[3].expectedFinish,undefined);assert.equal(next.nodes[3].materialEta,undefined);
  assert.equal(next.feedback[1].expectedFinish,'2026-09-13');assert.equal(next.feedback[1].materialEta,'2026-09-10');
});
test('return starts a fresh round without prior completion or material estimates',async()=>{
  const {returnNode}=await import('./helpers/domain.ts');
  const first=applyFeedback(createOrders()[0],{nodeId:'assembly',expectedVersion:1,mode:'percent',percent:100,expectedFinish:'2026-09-13',materialEta:'2026-09-10'},'zhao');
  const next=returnNode(first,{nodeId:'assembly',expectedVersion:2,note:'repair'},'chen');
  assert.equal(next.nodes[3].expectedFinish,undefined);assert.equal(next.nodes[3].materialEta,undefined);
  assert.equal(next.feedback[0].expectedFinish,'2026-09-13');
});
