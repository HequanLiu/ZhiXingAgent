import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,configureProject} from './helpers/project.ts';
import {evaluateSchedule} from '../apps/soundlab-api/schedule.ts';
const nodes=()=>[{id:'a',name:'design',owner:'chen',due:'2026-09-10',weight:0.5,dependencies:[],durationDays:1,acceptanceCriteria:'drawing approved'},{id:'b',name:'assembly',owner:'zhao',due:'2026-09-12',weight:0.5,dependencies:['a'],durationDays:2,acceptanceCriteria:'inspection passed'}];
const calendar={weekdays:[1,2,3,4,5],holidays:[]};
const order=()=>newProject({id:'C-001',product:'speaker',customer:'customer',due:'2026-09-30',calendar,nodes:nodes()},'demo','chen');
const input=()=>({expectedVersion:1,calendar,nodes:nodes()});
test('configuration validates permission, version, DAG, calendar and exact node set',()=>{
  const p=order();assert.throws(()=>configureProject(p,input(),'zhao'),/FORBIDDEN/);
  assert.throws(()=>configureProject(p,{...input(),expectedVersion:0},'chen'),/VERSION_CONFLICT/);
  for(const edit of [(v:any)=>v.nodes.pop(),(v:any)=>v.nodes[0].dependencies=['b'],(v:any)=>v.nodes[0].weight=0.2,(v:any)=>v.calendar={weekdays:[],holidays:[]},(v:any)=>v.nodes[0].owner='unknown',(v:any)=>v.nodes[0]=null]){
    const v=input();edit(v);assert.throws(()=>configureProject(p,v,'chen'),/VALIDATION_ERROR/);
  }
});
test('configuration rejects writable-state and outer-order injection',()=>{
  for(const field of ['status','percent','acceptance','reworks','expectedFinish','materialEta']){
    const v=input();(v.nodes[0] as any)[field]=null;
    assert.throws(()=>configureProject(order(),v,'chen'),/VALIDATION_ERROR/);
  }
  for(const field of ['due','customer','feedback','configurationHistory','tenant','id'])assert.throws(()=>configureProject(order(),{...input(),[field]:null},'chen'),/VALIDATION_ERROR/);
});
test('configuration preserves actual history and appends immutable before and after snapshots',()=>{
  const p=order();p.nodes[0].status='accepted';p.nodes[0].percent=100;p.nodes[0].acceptance={actor:'chen',at:'2026-09-07T08:00:00Z',sourceVersion:1,note:'passed'};
  p.nodes[1].reworks=[{actor:'chen',at:'2026-09-06T08:00:00Z',sourceVersion:1,note:'repair',previousPercent:100}];
  p.feedback=[{id:'f',nodeId:'a',actor:'chen',completed:1,total:1,blocker:'',at:'2026-09-07T07:00:00Z'}];
  const original=structuredClone(p);const v=input();v.nodes[0].owner='wang';v.nodes[0].durationDays=3;v.nodes[1].dependencies=[];
  const updated=configureProject(p,v,'chen');
  assert.equal(updated.version,2);assert.equal(updated.nodes[0].owner,'wang');assert.equal(updated.nodes[0].status,'accepted');assert.equal(updated.nodes[0].percent,100);
  assert.deepEqual(updated.nodes[0].acceptance,p.nodes[0].acceptance);assert.deepEqual(updated.nodes[1].reworks,p.nodes[1].reworks);assert.deepEqual(updated.feedback,p.feedback);assert.equal(updated.due,p.due);assert.deepEqual(p,original);
  const audit=updated.configurationHistory![0];assert.equal(audit.actor,'chen');assert.equal(audit.sourceVersion,1);assert.ok(Number.isFinite(Date.parse(audit.at)));assert.equal(audit.before.nodes[0].owner,'chen');assert.equal(audit.after.nodes[0].owner,'wang');
  v.nodes[0].name='mutated';assert.equal(updated.nodes[0].name,'design');
  const again=configureProject(updated,{...input(),expectedVersion:2},'chen');assert.equal(again.configurationHistory!.length,2);assert.deepEqual(again.configurationHistory![0],audit);
});
test('legacy metadata can be supplied without inventing old facts',()=>{
  const p=order();delete p.calendar;delete p.nodes[0].dependencies;delete p.nodes[0].durationDays;
  const updated=configureProject(p,input(),'chen');assert.equal(updated.configurationHistory![0].before.calendar,undefined);assert.equal(updated.configurationHistory![0].before.nodes[0].durationDays,undefined);assert.equal(updated.nodes[0].durationDays,1);
});
test('unknown accepted history does not conceal computed unfinished forecast',()=>{
  const p=order();p.nodes[0].status='accepted';p.nodes[0].percent=100;
  const result=evaluateSchedule(p,'2026-09-08');assert.equal(result.forecast,'2026-09-09');assert.ok(result.missing.length>0);
  p.nodes[1].status='accepted';p.nodes[1].percent=100;assert.equal(evaluateSchedule(p,'2026-09-08').forecast,null);
});
