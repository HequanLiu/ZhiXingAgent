import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import * as store from '../helpers/store.ts';
const input={id:'BATCH-A',product:'音箱',customer:'客户',due:'2026-09-30',calendar:{weekdays:[1,2,3,4,5],holidays:[]},nodes:[{id:'a',name:'装配',owner:'zhao',due:'2026-09-29',weight:1,durationDays:2,dependencies:[],acceptanceCriteria:'合格',percent:100,status:'accepted'}],feedback:[{forged:true}]};
test('batch creation validates all rows atomically and retries stable JSON keys exactly once',async()=>{
 assert.equal(typeof store.createProjectBatch,'function');
 await store.migrate(); const tenant='batch-'+randomUUID();
 try{
 await assert.rejects(store.createProjectBatch(tenant,'zhao','no',[input]),/FORBIDDEN/);
 await assert.rejects(store.createProjectBatch(tenant,'chen','bad',[input,{...input,id:'B',due:'bad'}]),/VALIDATION_ERROR/);
 assert.equal((await store.list(tenant)).length,0);
 await assert.rejects(store.createProjectBatch(tenant,'chen','dupe',[input,input]),/VALIDATION_ERROR/);
 await assert.rejects(store.createProjectBatch(tenant,'chen','many',Array(51).fill(input)),/VALIDATION_ERROR/);
 const result=await store.createProjectBatch(tenant,'chen','batch',[input,{...input,id:'BATCH-B'}]);
 assert.equal(result.orders[0].nodes[0].percent,0);assert.deepEqual(result.orders[0].feedback,[]);
 const reordered=Object.fromEntries(Object.entries(input).reverse());
 assert.deepEqual(await store.createProjectBatch(tenant,'chen','batch',[reordered,{...input,id:'BATCH-B'}]),result);
 await assert.rejects(store.createProjectBatch(tenant,'chen','batch',[{...input,id:'OTHER'}]),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(store.createProjectBatch(tenant,'chen','collision',[{...input,id:'FRESH'},input]),/ORDER_EXISTS/);
 assert.equal((await store.list(tenant)).length,2);
 assert.equal((await store.pool.query('SELECT count(*)::int n FROM outbox WHERE tenant=$1',[tenant])).rows[0].n,2);
 }finally{for(const table of ['outbox','mutations','orders'])await store.pool.query(`DELETE FROM ${table} WHERE tenant=$1`,[tenant]);}
});
test('templates isolate tenants, strip facts, enforce manager and concurrent versions, retain audit on delete',async()=>{
 assert.equal(typeof store.saveProjectTemplate,'function');await store.migrate();const tenant='template-'+randomUUID();
 try{
 await assert.rejects(store.saveProjectTemplate(tenant,'zhao','no',{id:'standard',name:'标准',project:input}),/FORBIDDEN/);
 const created=await store.saveProjectTemplate(tenant,'chen','create',{id:'standard',name:'标准',project:input});
 assert.deepEqual(await store.saveProjectTemplate(tenant,'chen','create',{id:'standard',name:'标准',project:input}),created);
 await assert.rejects(store.saveProjectTemplate(tenant,'chen','create',{id:'standard',name:'不同',project:input}),/IDEMPOTENCY_CONFLICT/);
 assert.equal(created.version,1);assert.equal(created.project.feedback,undefined);assert.equal(created.project.nodes[0].percent,undefined);
 assert.deepEqual(await store.listProjectTemplates(tenant+'other'),[]);
 const results=await Promise.allSettled(['a','b'].map(name=>store.saveProjectTemplate(tenant,'chen',name,{id:'standard',name,expectedVersion:1,project:input})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(String((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason),/VERSION_CONFLICT/);
 await assert.rejects(store.deleteProjectTemplate(tenant+'other','chen','standard','delete',2),/NOT_FOUND/);
 await store.deleteProjectTemplate(tenant,'chen','standard','delete',2);
 assert.deepEqual(await store.deleteProjectTemplate(tenant,'chen','standard','delete',2),{deleted:true});
 assert.deepEqual(await store.listProjectTemplates(tenant),[]);
 assert.equal((await store.pool.query('SELECT count(*)::int n FROM project_template_audit WHERE tenant=$1',[tenant])).rows[0].n,3);
 }finally{for(const table of ['project_template_audit','project_templates','mutations'])await store.pool.query(`DELETE FROM ${table} WHERE tenant=$1`,[tenant]);}
});
test.after(()=>store.pool.end());

