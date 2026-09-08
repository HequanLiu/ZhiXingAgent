import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';
test('delegated change waits for human approval and recovers a lost execution reply using the same receipt key',async()=>{
 const {migrateChangeTasks,delegateChange,runChangeTask}=await import('../../apps/zhixing-worker/change-tasks.ts');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const root=new Pool({connectionString});const schema='test_tasks_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 const p={tenant:'t',actor:'chen'};let status='proposed',writes=0,receipt:any=null,expectedKey='';const plan={id:'c',orderId:'order',sourceVersion:1,planVersion:1};let lost=true;
 const invoke=async(cap:string,input:any,principal:any,key?:string)=>{assert.deepEqual(principal,p);if(cap==='sampling.changes.list')return [{...plan,status}];if(cap==='sampling.invocation.get'){assert.deepEqual(input,{key:expectedKey});if(!receipt)throw Error('NOT_FOUND');return receipt;}if(cap==='sampling.change.apply'){assert.equal(key,expectedKey);assert.equal(status,'approved');writes++;receipt={id:'receipt',changeId:'c',status:'completed',result:{version:2}};if(lost){lost=false;throw Error('SERVICE_UNAVAILABLE');}return receipt;}throw Error('UNEXPECTED');};
 try{await seedTestMembers(db);await migrateChangeTasks(db);await assert.rejects(delegateChange(db,{...p,actor:'wang'},'c',invoke),/FORBIDDEN/);const first=await delegateChange(db,p,'c',invoke);assert.equal((await delegateChange(db,p,'c',invoke)).id,first.id);
  expectedKey='approved-task-'+first.id;
  await runChangeTask(db,invoke);assert.equal(writes,0);assert.equal((await db.query('SELECT status FROM change_tasks')).rows[0].status,'awaiting_approval');
  status='approved';await db.query('UPDATE change_tasks SET next_run_at=now()');await runChangeTask(db,invoke);assert.equal(writes,1);assert.equal((await db.query('SELECT status FROM change_tasks')).rows[0].status,'unknown');
  await db.query('UPDATE change_tasks SET next_run_at=now()');await runChangeTask(db,invoke);assert.equal(writes,1);assert.equal((await db.query('SELECT status FROM change_tasks')).rows[0].status,'succeeded');
  plan.id='bad';receipt={status:'unknown'};const bad=await delegateChange(db,p,'bad',invoke);expectedKey='approved-task-'+bad.id;await runChangeTask(db,invoke);assert.equal((await db.query("SELECT status FROM change_tasks WHERE change_id='bad'")).rows[0].status,'unknown');
 }finally{await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});

test('rejected approval and changed plan version never dispatch a business write',async()=>{
 const {migrateChangeTasks,delegateChange,runChangeTask}=await import('../../apps/zhixing-worker/change-tasks.ts');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const root=new Pool({connectionString});const schema='test_task_guard_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 const p={tenant:'isolated-tenant',actor:'chen'};let writes=0;
 const plans=[{id:'rejected',status:'proposed',sourceVersion:1,planVersion:1},{id:'changed',status:'approved',sourceVersion:1,planVersion:1}];
 const invoke=async(cap:string)=>{if(cap==='sampling.changes.list')return structuredClone(plans);if(cap==='sampling.invocation.get')throw Error('NOT_FOUND');if(cap==='sampling.change.apply'){writes++;throw Error('UNEXPECTED_WRITE');}throw Error('UNEXPECTED');};
 try{
  await seedTestMembers(db);await migrateChangeTasks(db);await delegateChange(db,p,'rejected',invoke);plans[0].status='rejected';
  await runChangeTask(db,invoke);
  assert.deepEqual((await db.query("SELECT status,error_code FROM change_tasks WHERE change_id='rejected'")).rows,[{status:'rejected',error_code:null}]);
  await delegateChange(db,p,'changed',invoke);plans[1].planVersion=2;
  await runChangeTask(db,invoke);
  assert.deepEqual((await db.query("SELECT status,error_code FROM change_tasks WHERE change_id='changed'")).rows,[{status:'failed',error_code:'VERSION_CONFLICT'}]);
  assert.equal(writes,0);
 }finally{await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});

test('expired claim recovers the receipt and fences the old worker final result', {timeout:15000},async()=>{
 const {migrateChangeTasks,delegateChange,runChangeTask}=await import('../../apps/zhixing-worker/change-tasks.ts');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const root=new Pool({connectionString});const schema='test_task_fence_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 const p={tenant:'claim-tenant',actor:'chen'};const plan={id:'fenced',status:'approved',sourceVersion:1,planVersion:1};
 let signalDispatched!:()=>void,releaseOld!:()=>void;
 const dispatched=new Promise<void>(resolve=>{signalDispatched=resolve;});const delayedResponse=new Promise<void>(resolve=>{releaseOld=resolve;});
 let receipt:any=null,writes=0;const receiptKeys:string[]=[],writeKeys:(string|undefined)[]=[];let oldRun:Promise<boolean>|undefined;
 const invoke=async(cap:string,input:any,principal:any,key?:string)=>{
  assert.deepEqual(principal,p);
  if(cap==='sampling.changes.list')return [plan];
  if(cap==='sampling.invocation.get'){receiptKeys.push(input.key);if(!receipt)throw Error('NOT_FOUND');return receipt;}
  if(cap==='sampling.change.apply'){
   writes++;writeKeys.push(key);receipt={id:'durable-receipt',changeId:plan.id,status:'completed',result:{version:2}};
   signalDispatched();await delayedResponse;throw Error('VERSION_CONFLICT');
  }
  throw Error('UNEXPECTED');
 };
 try{
  await seedTestMembers(db);await migrateChangeTasks(db);const task=await delegateChange(db,p,plan.id,invoke);
  oldRun=runChangeTask(db,invoke);await dispatched;
  const claimed=(await db.query('SELECT status,claim_token FROM change_tasks WHERE id=$1',[task.id])).rows[0];assert.equal(claimed.status,'running');assert.ok(claimed.claim_token);
  await db.query("UPDATE change_tasks SET updated_at=now()-interval '3 minutes' WHERE id=$1",[task.id]);
  await runChangeTask(db,invoke);
  const afterRecovery=(await db.query('SELECT * FROM change_tasks WHERE id=$1',[task.id])).rows[0];assert.equal(afterRecovery.status,'succeeded');assert.equal(afterRecovery.claim_token,null);assert.deepEqual(afterRecovery.result,receipt);
  releaseOld();await oldRun;
  assert.deepEqual((await db.query('SELECT * FROM change_tasks WHERE id=$1',[task.id])).rows[0],afterRecovery);
  assert.deepEqual((await db.query('SELECT status,error_code FROM change_task_audit WHERE task_id=$1',[task.id])).rows,[{status:'succeeded',error_code:null}]);
  assert.equal(writes,1);assert.deepEqual(writeKeys,['approved-task-'+task.id]);assert.deepEqual(receiptKeys,['approved-task-'+task.id,'approved-task-'+task.id]);
 }finally{releaseOld();await oldRun;await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
