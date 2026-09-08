import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrders,applyFeedback,acceptNode} from './helpers/domain.ts';
const input={nodeId:'assembly',expectedVersion:2,note:'演示验收：数量与装配检查通过'};
const ready=()=>applyFeedback(createOrders()[0],{nodeId:'assembly',expectedVersion:1,completed:20,total:20},'zhao');
test('only manager accepts reported completion and records actual acceptance evidence',()=>{
  const order=ready();
  assert.throws(()=>acceptNode(order,input,'zhao'),/FORBIDDEN/);
  const accepted=acceptNode(order,input,'chen');const node=accepted.nodes.find(n=>n.id==='assembly')!;
  assert.equal(accepted.version,3);assert.equal(node.status,'accepted');
  assert.equal(node.acceptance?.actor,'chen');assert.equal(node.acceptance?.note,input.note);
  assert.equal(node.acceptance?.sourceVersion,2);assert.ok(node.acceptance?.at);
  assert.equal(order.nodes.find(n=>n.id==='assembly')?.status,'reported_complete');
  assert.throws(()=>acceptNode(accepted,{...input,expectedVersion:3},'chen'),/NODE_CLOSED/);
});
test('acceptance requires current version, waiting status and a bounded textual note',()=>{
  assert.throws(()=>acceptNode(ready(),{...input,expectedVersion:1},'chen'),/VERSION_CONFLICT/);
  assert.throws(()=>acceptNode(createOrders()[0],{...input,expectedVersion:1},'chen'),/NODE_NOT_READY/);
  assert.throws(()=>acceptNode(ready(),{...input,note:'a'.repeat(501)},'chen'),/VALIDATION_ERROR/);
  assert.throws(()=>acceptNode(ready(),{...input,note:4 as unknown as string},'chen'),/VALIDATION_ERROR/);
});
test('rounded 100 percent is not a complete quantity report',()=>{
  const order=applyFeedback(createOrders()[0],{nodeId:'assembly',expectedVersion:1,completed:199,total:200},'zhao');
  assert.equal(order.nodes.find(n=>n.id==='assembly')?.status,'in_progress');
});
