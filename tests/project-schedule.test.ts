import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject} from './helpers/project.ts';
import {evaluateSchedule} from '../apps/sample-reference-service/schedule.ts';
const input=()=>({id:'S-001',product:'蓝牙音箱',customer:'示例客户',due:'2026-09-15',calendar:{weekdays:[1,2,3,4,5],holidays:['2026-09-07']},nodes:[
  {id:'design',name:'结构设计',owner:'wang',due:'2026-09-08',weight:0.5,dependencies:[],durationDays:1,acceptanceCriteria:'图纸确认'},
  {id:'assembly',name:'装配',owner:'zhao',due:'2026-09-09',weight:0.5,dependencies:['design'],durationDays:2,acceptanceCriteria:'装配复检通过'}]});
test('new project validates ownership, calendar, dates, weights and DAG',()=>{
  const p=newProject(input(),'demo','chen');assert.equal(p.version,1);assert.equal(p.nodes[0].status,'not_started');
  assert.throws(()=>newProject(input(),'demo','zhao'),/FORBIDDEN/);
  for(const change of [(p:any)=>p.nodes[0].dependencies=['assembly'],(p:any)=>p.nodes[0].weight=0.3,(p:any)=>p.nodes[0].owner='unknown',(p:any)=>p.due='2026-02-30',(p:any)=>p.calendar.weekdays=[],(p:any)=>p.nodes[0].dependencies=['missing']]){
    const p=input();change(p);assert.throws(()=>newProject(p,'demo','chen'),/VALIDATION_ERROR/);
  }
});
test('schedule respects holiday and dependencies without changing business facts',()=>{
  const p=newProject(input(),'demo','chen');const before=structuredClone(p);
  const result=evaluateSchedule(p,'2026-09-04');
  assert.equal(result.forecast,'2026-09-09');assert.equal(result.risk,'normal');assert.deepEqual(p,before);
  assert.equal(result.nodes.find(n=>n.nodeId==='assembly')?.start,'2026-09-08');
});
test('blocker missing recovery evidence yields unknown rather than invented forecast',()=>{
  const p=newProject(input(),'demo','chen');p.nodes[0].status='blocked';
  const r=evaluateSchedule(p,'2026-09-04');assert.equal(r.forecast,null);assert.equal(r.risk,'attention');assert.ok(r.missing.some(x=>x.includes('结构设计')));
  p.nodes[0].expectedFinish='2026-09-16';assert.equal(evaluateSchedule(p,'2026-09-04').risk,'risk');
});
test('legacy nodes without duration or dependency facts remain unverified',()=>{
  const p=newProject(input(),'demo','chen');delete p.nodes[1].durationDays;
  assert.equal(evaluateSchedule(p,'2026-09-04').forecast,null);
  assert.throws(()=>validateProject({...p,nodes:[...p.nodes,p.nodes[0]]}),/VALIDATION_ERROR/);
});

test('legacy acceptance time stays unknown but does not block an unfinished successor',()=>{
  const p=newProject(input(),'demo','chen');p.nodes[0].status='accepted';p.nodes[0].percent=100;
  const r=evaluateSchedule(p,'2026-09-08');
  assert.equal(r.nodes.find(n=>n.nodeId==='design')?.finish,null);
  assert.equal(r.nodes.find(n=>n.nodeId==='assembly')?.start,'2026-09-08');
  p.nodes[1].status='accepted';p.nodes[1].percent=100;
  const completed=evaluateSchedule(p,'2026-10-01');
  assert.equal(completed.forecast,null);assert.equal(completed.risk,'attention');
});
test('actual acceptance dates use the Shanghai business calendar',()=>{
  const p=newProject(input(),'demo','chen');
  for(const n of p.nodes){n.status='accepted';n.percent=100;n.acceptance={actor:'chen',at:'2026-09-07T17:00:00.000Z',note:'ok',sourceVersion:1};}
  assert.equal(evaluateSchedule(p,'2026-09-08').forecast,'2026-09-08');
});
test('malformed project and null nodes produce validation errors',()=>{
  for(const p of [null,[],{...input(),nodes:[null]},{...input(),calendar:null},{...input(),nodes:[{...input().nodes[0],dependencies:null}]}])assert.throws(()=>validateProject(p),/VALIDATION_ERROR/);
});
