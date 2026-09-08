import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {createOrders} from '../helpers/domain.ts';
test('change approval transaction lifecycle and safeguards',async()=>{
 assert.ok(existsSync('apps/soundlab-api/changes.ts'),'change approval service must exist');
 const m=await import('../helpers/changes.ts');
 const connectionString='postgresql://soundlab_business:business-local-only@127.0.0.1:55439/soundlab_business';
 const admin=new Pool({connectionString});const schema='test_changes_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
 await db.query(`CREATE TABLE orders(tenant text,id text,data jsonb,PRIMARY KEY(tenant,id));CREATE TABLE mutations(tenant text,key text,fingerprint text,result jsonb,PRIMARY KEY(tenant,key));CREATE TABLE outbox(id text PRIMARY KEY,sequence bigserial,tenant text,object_id text,version integer);`);
 await m.migrateChanges(db);await m.migrateChanges(db);
 const order=createOrders()[0];await db.query('INSERT INTO orders VALUES($1,$2,$3)',[order.tenant,order.id,order]);
 const principal={tenant:'demo',actor:'chen'},input={orderId:order.id,sourceVersion:1,due:'2026-10-01',extraCostCents:12000,reason:'客户确认延期与加急成本'};
 await assert.rejects(m.proposeChange(db,{...principal,actor:'wang'},input,'p0'),/FORBIDDEN/);
 await assert.rejects(m.proposeChange(db,{...principal,tenant:'other'},input,'p0'),/NOT_FOUND/);
 for(const bad of [{...input,extraCostCents:1.5},{...input,due:'2026-02-30'},{...input,reason:'x'.repeat(501)},{...input,unexpected:true}])await assert.rejects(m.proposeChange(db,principal,bad,'bad'),/VALIDATION_ERROR/);
 const plan=await m.proposeChange(db,principal,input,'p1');assert.equal(plan.status,'proposed');assert.equal(plan.planVersion,1);
 assert.deepEqual(await m.proposeChange(db,principal,input,'p1'),plan);
 await assert.rejects(m.proposeChange(db,principal,{...input,reason:'different'},'p1'),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(m.applyChange(db,principal,plan.id,'a1'),/CHANGE_NOT_APPROVED/);
 await assert.rejects(m.decideChange(db,principal,plan.id,'approve',2),/VERSION_CONFLICT/);
 await assert.rejects(m.decideChange(db,{...principal,actor:'wang'},plan.id,'approve',1),/FORBIDDEN/);
 await m.decideChange(db,principal,plan.id,'approve',1);
 await assert.rejects(db.query("UPDATE change_plans SET due='2026-11-01'"),/immutable/);
 const invocations=await Promise.all([m.applyChange(db,principal,plan.id,'a1'),m.applyChange(db,principal,plan.id,'a1')]);assert.deepEqual(invocations[0],invocations[1]);
 assert.equal(invocations[0].result.version,2);assert.equal(invocations[0].result.due,input.due);assert.deepEqual(invocations[0].result.nodes,order.nodes);
 assert.equal((await db.query('SELECT count(*) FROM outbox')).rows[0].count,'1');
 assert.deepEqual(await m.getInvocation(db,principal,{key:'a1'}),invocations[0]);assert.deepEqual(await m.getInvocation(db,principal,{id:invocations[0].id}),invocations[0]);
 await assert.rejects(m.getInvocation(db,{...principal,tenant:'other'},{key:'a1'}),/NOT_FOUND/);
 await assert.rejects(m.applyChange(db,principal,plan.id,'a2'),/CHANGE_ALREADY_APPLIED/);
 const next=await m.proposeChange(db,principal,{...input,sourceVersion:2},'p2');
 await assert.rejects(m.applyChange(db,principal,next.id,'a1'),/IDEMPOTENCY_CONFLICT/);
 await db.query("UPDATE orders SET data=jsonb_set(data,'{version}','3')");
 await assert.rejects(m.decideChange(db,principal,next.id,'approve',1),/VERSION_CONFLICT/);
 const stale=await m.proposeChange(db,principal,{...input,sourceVersion:3},'p3');await m.decideChange(db,principal,stale.id,'approve',1);
 await db.query("UPDATE orders SET data=jsonb_set(data,'{version}','4')");await assert.rejects(m.applyChange(db,principal,stale.id,'a3'),/VERSION_CONFLICT/);
 const rejected=await m.proposeChange(db,principal,{...input,sourceVersion:4},'p4');await m.decideChange(db,principal,rejected.id,'reject',1);await assert.rejects(m.applyChange(db,principal,rejected.id,'a4'),/CHANGE_NOT_APPROVED/);
 const rollback=await m.proposeChange(db,principal,{...input,sourceVersion:4},'p5');await m.decideChange(db,principal,rollback.id,'approve',1);
 await db.query(`CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private diagnostic'; END; $$;CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox();`);
 await assert.rejects(m.applyChange(db,principal,rollback.id,'a5'),/^Error: SERVICE_UNAVAILABLE$/);
 assert.equal((await m.getChange(db,principal,rollback.id)).status,'approved');assert.equal((await db.query('SELECT data FROM orders')).rows[0].data.version,4);await assert.rejects(m.getInvocation(db,principal,{key:'a5'}),/NOT_FOUND/);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

