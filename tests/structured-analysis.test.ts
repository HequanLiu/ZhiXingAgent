import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSoundlabAnalysis} from '../packages/scenario-soundlab/analysis-result.ts';
const event={object_id:'A26-018',version:4};
const snapshot={id:'A26-018',version:5,product:'蓝牙音箱',due:'2026-09-15',risk:'attention',overallPercent:53,
  nodes:[{id:'assembly',name:'样机装配',status:'blocked',owner:'zhou',percent:70,plannedDue:'2026-09-11'},
    {id:'acoustics',name:'声学测试',status:'not_started',owner:'zhou',percent:0,plannedDue:'2026-09-12'}]};
const receipts=[{capability:'sampling.orders.list',orderCount:24,at:'2026-09-07T00:00:00Z',objects:[{id:'A26-018',version:5,evidence:snapshot}]}];
const output={orderId:'A26-018',version:5,checks:[{nodeId:'assembly',kind:'confirm_blocker'}]};
test('facts and completion dates are rendered from exact receipt; model selects checks only',()=>{
  const result=renderSoundlabAnalysis(JSON.stringify(output),receipts,event);
  assert.equal(result.observedVersion,5);
  assert.match(result.summary,/整单进度：53%/);
  assert.match(result.summary,/声学测试.*计划完成 2026-09-12/);
  assert.match(result.summary,/周敏.*核实阻塞原因/);
  assert.doesNotMatch(result.summary,/2026-09-12 启动/);
});
test('model cannot add fabricated progress, unknown nodes or unsupported checks',()=>{
  for(const wrong of [{...output,overallPercent:99},
    {...output,checks:[{nodeId:'fake',kind:'confirm_blocker'}]},
    {...output,checks:[{nodeId:'acoustics',kind:'confirm_blocker'}]},
    {...output,checks:[{nodeId:'assembly',kind:'approve_delay'}]}])
    assert.throws(()=>renderSoundlabAnalysis(JSON.stringify(wrong),receipts,event),/ANALYSIS_SCHEMA_INVALID/);
});
test('missing snapshot, wrong order or version cannot become verified facts',()=>{
  assert.throws(()=>renderSoundlabAnalysis(JSON.stringify({...output,version:6}),receipts,event),/EVIDENCE_MISSING/);
  assert.throws(()=>renderSoundlabAnalysis(JSON.stringify({...output,orderId:'A26-019'}),receipts,event),/ANALYSIS_SCHEMA_INVALID/);
  assert.throws(()=>renderSoundlabAnalysis(JSON.stringify(output),receipts,{...event,version:6}),/ANALYSIS_SCHEMA_INVALID/);
  assert.throws(()=>renderSoundlabAnalysis(JSON.stringify(output),[{...receipts[0],objects:[{id:'A26-018',version:5}]}],event),/EVIDENCE_MISSING/);
});
test('rework suggestion is based on rework state and does not invent a cause',()=>{
  const updated=structuredClone(receipts);const node=updated[0].objects[0].evidence.nodes[0];node.status='rework';node.percent=0;
  const result=renderSoundlabAnalysis(JSON.stringify({...output,checks:[{nodeId:'assembly',kind:'confirm_rework'}]}),updated,event);
  assert.match(result.summary,/返工待反馈 0%/);assert.match(result.summary,/核实返工范围/);
  assert.throws(()=>renderSoundlabAnalysis(JSON.stringify({...output,checks:[{nodeId:'assembly',kind:'confirm_rework'}]}),receipts,event),/ANALYSIS_SCHEMA_INVALID/);
});
