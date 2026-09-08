import test from 'node:test';
import assert from 'node:assert/strict';
import {workerTiming} from '../apps/zhixing-worker/timing.mjs';
test('worker timing defaults and configurable analysis cadence',()=>{
  assert.deepEqual(workerTiming({}),{eventPollMs:1500,analysisIntervalMs:5000});
  assert.equal(workerTiming({SOUNDLAB_ANALYSIS_INTERVAL_MS:'60000'}).analysisIntervalMs,60000);
});
test('invalid intervals fail startup rather than causing a fast model loop',()=>{
  for(const value of ['0','-1','NaN','1000.5','3600001',''])assert.throws(()=>workerTiming({SOUNDLAB_ANALYSIS_INTERVAL_MS:value}),/INVALID_WORKER_INTERVAL/);
});
