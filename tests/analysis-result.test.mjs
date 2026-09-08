import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAnalysis, retryState, assertRunCompleted, safeAnalysisError } from '../packages/runtime-deepseek/result.mjs';
test('runtime timeout becomes a safe error code; raw provider messages stay private',()=>{
  assert.throws(()=>assertRunCompleted([{type:'turn/end',data:{reason:{kind:'error',error:{code:'TIMEOUT',message:'private request details'}}}}]),/MODEL_TIMEOUT/);
  assert.equal(safeAnalysisError(new Error('MODEL_TIMEOUT')),'MODEL_TIMEOUT');
  assert.equal(safeAnalysisError(new Error('private request details')),'ANALYSIS_FAILED');
});
import {modelConfiguration} from '../packages/runtime-deepseek/index.mjs';

test('model event dispatch requires both explicit enablement and selected provider key',()=>{
  assert.equal(modelConfiguration({MINIMAX_API_KEY:'test'}).enabled,false);
  assert.equal(modelConfiguration({SOUNDLAB_MODEL_ANALYSIS:'true'}).enabled,false);
  assert.equal(modelConfiguration({SOUNDLAB_MODEL_ANALYSIS:'true',MINIMAX_API_KEY:'test'}).enabled,true);
});

test('analysis needs a real receipt for the event object at or after its version',()=>{
  const receipt={capability:'sampling.orders.list',objects:[{id:'A26-018',version:3}]};
  assert.throws(()=>verifyAnalysis('摘要',[],{id:'A26-018',version:2,capability:'sampling.orders.list'}),/EVIDENCE_MISSING/);
  assert.throws(()=>verifyAnalysis('摘要',[receipt],{id:'A26-018',version:4,capability:'sampling.orders.list'}),/EVIDENCE_MISSING/);
  const verified=verifyAnalysis('摘要',[receipt],{id:'A26-018',version:2,capability:'sampling.orders.list'});
  assert.equal(verified.observedVersion,3);
  assert.equal(verified.summary,'摘要');
});
test('empty or oversized model output is never a successful result',()=>{
  const receipts=[{objects:[{id:'a',version:1}]}];
  assert.throws(()=>verifyAnalysis('',receipts,{id:'a',version:1}),/MODEL_OUTPUT_INVALID/);
  assert.throws(()=>verifyAnalysis('a'.repeat(6001),receipts,{id:'a',version:1}),/MODEL_OUTPUT_INVALID/);
});
test('only final answer is published; unclosed reasoning is rejected',()=>{
  const receipts=[{capability:'read',objects:[{id:'a',version:1}]}];const expected={id:'a',version:1,capability:'read'};
  assert.equal(verifyAnalysis('<think>internal draft</think>最终摘要',receipts,expected).summary,'最终摘要');
  assert.throws(()=>verifyAnalysis('<think>unfinished',receipts,expected),/MODEL_OUTPUT_INVALID/);
});
test('retry has backoff and stops after three attempts',()=>{
  assert.deepEqual(retryState(1),{status:'retry',delaySeconds:10});
  assert.deepEqual(retryState(2),{status:'retry',delaySeconds:30});
  assert.deepEqual(retryState(3),{status:'failed',delaySeconds:0});
});
