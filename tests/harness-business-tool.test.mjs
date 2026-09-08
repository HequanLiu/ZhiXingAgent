import test from 'node:test';
import assert from 'node:assert/strict';
import { querySamplingEvidence } from '../packages/scenario-soundlab/harness-tools.mjs';

test('model query uses fixed read-only platform route and returns bounded business evidence', async () => {
  let request;
  const evidence = await querySamplingEvidence(async (url, init) => {
    request={url,init};
    return {ok:true,json:async()=>[{id:'A26-018',version:3,product:'音响',risk:'attention',due:'2026-09-10',nodes:[{id:'assembly',percent:65,weight:0.2,due:'2026-09-09'}],feedback:[]}]};
  });
  assert.equal(request.url,'http://127.0.0.1:4310/api/soundlab/orders');
  assert.equal(request.init.method,'GET');
  assert.equal(request.init.headers['x-demo-user'],'chen');
  assert.equal(evidence.orderCount,1);
  assert.equal(evidence.orders[0].version,3);
  assert.equal(evidence.orders[0].nodes[0].percent,65);
  assert.equal(evidence.orders[0].overallPercent,13);
  assert.equal(evidence.orders[0].nodes[0].plannedDue,'2026-09-09');
});

test('failed platform query is not presented as empty/successful evidence', async () => {
  await assert.rejects(querySamplingEvidence(async()=>({ok:false,status:403})),/BUSINESS_QUERY_FAILED/);
});
test('imported projects cannot enter model evidence under existing demo-only authorization',async()=>{
  const result=await querySamplingEvidence(async()=>({ok:true,json:async()=>[
    {id:'A26-018',version:1,nodes:[]},{id:'REAL-001',version:1,product:'private',nodes:[]},{id:'A26-999',version:1,nodes:[]}]}));
  assert.deepEqual(result.orders.map(o=>o.id),['A26-018']);assert.equal(result.orderCount,1);
});
