import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrders,applyFeedback,acceptNode,returnNode,orderProgress} from './helpers/domain.ts';
const ready=()=>applyFeedback(createOrders()[0],{nodeId:'assembly',expectedVersion:1,completed:20,total:20},'zhao');
const input={nodeId:'assembly',expectedVersion:2,note:'演示：网罩装配间隙不一致，需调整后复检'};
test('return starts a new feedback round and retains history through resubmission and acceptance',()=>{
  const initial=ready();const returned=returnNode(initial,input,'chen');const node=returned.nodes[3];
  assert.equal(node.status,'rework');assert.equal(node.percent,0);assert.equal(returned.version,3);
  assert.equal(node.reworks?.[0].note,input.note);assert.equal(node.reworks?.[0].previousPercent,100);
  assert.equal(node.reworks?.[0].sourceVersion,2);assert.equal(returned.feedback[0].completed,20);
  assert.ok(orderProgress(returned)<orderProgress(initial));
  const reported=applyFeedback(returned,{nodeId:'assembly',expectedVersion:3,completed:20,total:20},'zhao');
  assert.equal(reported.feedback[0].round,1);assert.equal(reported.nodes[3].status,'reported_complete');
  const accepted=acceptNode(reported,{nodeId:'assembly',expectedVersion:4},'chen');
  assert.equal(accepted.nodes[3].status,'accepted');assert.equal(accepted.nodes[3].reworks?.length,1);
});
test('return is manager-only, version-bound and requires a reason',()=>{
  assert.throws(()=>returnNode(ready(),input,'zhao'),/FORBIDDEN/);
  assert.throws(()=>returnNode(ready(),{...input,expectedVersion:1},'chen'),/VERSION_CONFLICT/);
  for(const note of ['', '   ', 'a'.repeat(501)])assert.throws(()=>returnNode(ready(),{...input,note},'chen'),/VALIDATION_ERROR/);
  assert.throws(()=>returnNode(createOrders()[0],{...input,expectedVersion:1},'chen'),/NODE_NOT_READY/);
  assert.throws(()=>returnNode(acceptNode(ready(),input,'chen'),{...input,expectedVersion:3},'chen'),/NODE_CLOSED/);
});
test('repeat rework adds history and does not downgrade existing high risk',()=>{
  const initial=ready();initial.risk='risk';const first=returnNode(initial,input,'chen');
  assert.equal(first.risk,'risk');
  const readyAgain=applyFeedback(first,{nodeId:'assembly',expectedVersion:3,completed:20,total:20},'zhao');
  const twice=returnNode(readyAgain,{...input,expectedVersion:4,note:'复检仍未通过'},'chen');
  assert.equal(twice.nodes[3].reworks?.length,2);assert.equal(twice.nodes[3].reworks?.[0].note,input.note);
});
