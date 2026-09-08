import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4310',id='PATROL-'+Date.now();
async function api(path,body,actor='chen'){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-demo-user':actor,'idempotency-key':randomUUID()},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw new Error(value.code);return value;}
async function until(predicate){for(let i=0;i<20;i++){const result=await predicate();if(result)return result;await new Promise(r=>setTimeout(r,500));}throw new Error('PATROL_TIMEOUT');}
const before=(await api('/api/patrol')).policy;let policyVersion=before.version;
const policy={enabled:true,intervalMinutes:1,weekdays:[0,1,2,3,4,5,6],startHour:0,endHour:24};
async function tick(){policyVersion=(await api('/api/patrol',{expectedVersion:policyVersion,policy})).version;}
try {
 await api('/api/soundlab/orders',{id,product:'巡检演示音箱',customer:'本地巡检验收',due:'2026-09-30',calendar:{weekdays:[1,2,3,4,5],holidays:[]},nodes:[{id:'build',name:'演示装配',owner:'zhao',due:'2026-09-20',weight:1,dependencies:[],durationDays:1,acceptanceCriteria:'演示通过'}]});
 await api(`/api/soundlab/orders/${id}/feedback`,{nodeId:'build',completed:0,total:1,blocker:'演示：等待零件',expectedVersion:1},'zhao');await tick();
 let issue=await until(async()=> (await api('/api/exceptions')).find(x=>x.objectId===id&&x.issueKey==='build:blocked'));
 issue=await api('/api/exceptions/'+issue.id,{expectedVersion:issue.version,status:'in_progress',note:'演示：联系节点负责人'},'zhao');
 await api(`/api/soundlab/orders/${id}/feedback`,{nodeId:'build',completed:1,total:1,expectedVersion:2},'zhao');await api(`/api/soundlab/orders/${id}/accept`,{nodeId:'build',expectedVersion:3,note:'演示巡检闭环验收通过'});await tick();
 issue=await until(async()=> (await api('/api/exceptions')).find(x=>x.objectId===id&&x.sourceClear));
 issue=await api('/api/exceptions/'+issue.id,{expectedVersion:issue.version,status:'resolved',note:'演示：问题已解除'},'zhao');issue=await api('/api/exceptions/'+issue.id,{expectedVersion:issue.version,status:'closed',note:'演示：确认关闭'});
 assert.equal(issue.status,'closed');assert.ok(issue.audit.length>=5);
 const inbox=(await api('/api/patrol')).inbox.filter(x=>x.object_id===id);assert.equal(inbox.length,1);
 const result={orderId:id,status:issue.status,sourceClear:issue.sourceClear,auditEntries:issue.audit.length,reminders:inbox.length,modelRequestSent:false};await writeFile('.runtime/patrol-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await api('/api/patrol',{expectedVersion:policyVersion,policy:before.policy});}
