import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.SOUNDLAB_SMOKE_URL??'http://127.0.0.1:5179';const id='E2E-'+Date.now();
async function request(path,body,actor='chen',key=randomUUID()){
 const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-demo-user':actor,'idempotency-key':key,origin:base},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await r.json();if(!r.ok)throw new Error(path+': '+result.code);return result;
}
const calendar={weekdays:[1,2,3,4,5],holidays:[]};const nodes=[{id:'build',name:'演示装配',owner:'zhao',due:'2026-09-15',weight:1,durationDays:2,dependencies:[],acceptanceCriteria:'演示数量与装配确认通过'}];
const project={id,product:'演示验收音箱',customer:'本地验收示例',due:'2026-09-30',calendar,nodes};
let order=await request('/api/soundlab/orders',project);assert.equal(order.version,1);
order=await request(`/api/soundlab/orders/${id}/configure`,{expectedVersion:1,calendar,nodes:nodes.map(n=>({...n,durationDays:3}))});assert.equal(order.version,2);assert.equal(order.configurationHistory.length,1);
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ+0AAAAASUVORK5CYII=';
const attachment=await request('/api/soundlab/attachments',{orderId:id,nodeId:'build',expectedVersion:2,filename:'sample.png',mime:'image/png',base64:png},'zhao');assert.equal(attachment.sourceVersion,2);
const binary=await fetch(base+'/api/soundlab/attachments/'+attachment.id,{headers:{'x-demo-user':'chen'}});assert.equal(binary.status,200);assert.deepEqual(Buffer.from(await binary.arrayBuffer()),Buffer.from(png,'base64'));
order=await request(`/api/soundlab/orders/${id}/feedback`,{nodeId:'build',expectedVersion:3,mode:'percent',percent:25,expectedFinish:'2026-09-15'},'zhao');assert.equal(order.version,4);
const list=await request('/api/soundlab/orders');const assessed=list.find(o=>o.id===id);assert.equal(assessed.schedule.forecast,'2026-09-15');
const plan=await request('/api/soundlab/changes',{orderId:id,sourceVersion:4,due:'2026-09-16',extraCostCents:60000,reason:'演示：调整寄样安排并追加样件费用'});
assert.equal((await request(`/api/soundlab/changes/${plan.id}/decide`,{decision:'approve',expectedPlanVersion:1})).status,'approved');
const applyKey=randomUUID();const applied=await request(`/api/soundlab/changes/${plan.id}/apply`,{},'chen',applyKey);assert.equal(applied.result.version,5);
assert.deepEqual(await request(`/api/soundlab/changes/${plan.id}/apply`,{},'chen',applyKey),applied);assert.deepEqual(await request('/api/soundlab/invocations?key='+applyKey),applied);
order=await request(`/api/soundlab/orders/${id}/feedback`,{nodeId:'build',expectedVersion:5,completed:20,total:20},'zhao');assert.equal(order.version,6);
order=await request(`/api/soundlab/orders/${id}/accept`,{nodeId:'build',expectedVersion:6,note:'演示复检合格'});assert.equal(order.version,7);assert.equal(order.nodes[0].status,'accepted');
assert.equal((await request('/api/soundlab/attachments?orderId='+id)).length,1);
const capabilities=await request('/api/capabilities');assert.ok(capabilities[0].capabilities.some(c=>c.id==='sampling.project.configure'));
await request('/api/settings/runtime');await request('/api/operations');await request('/api/patrol');await request('/api/exceptions');
const result={checkedAt:new Date().toISOString(),orderId:id,version:order.version,attachment:true,configurationHistory:true,forecast:true,approvalReplay:true,acceptance:true,modelRequestSent:false};
await mkdir('.runtime',{recursive:true});await writeFile('.runtime/acceptance-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
