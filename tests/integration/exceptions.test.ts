import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';
import {migrateExceptions,reconcileExceptions,listExceptions,transitionException} from '../../apps/zhixing-api/exceptions.ts';
test('exception lifecycle isolates tenants, preserves assignment, audits source changes and serializes commands',async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const admin=new Pool({connectionString});const schema='test_exceptions_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 const manager={tenant:'demo',actor:'chen'},owner={tenant:'demo',actor:'zhao'};
 const facts=(version:number,issues=true)=>[{id:'A',version,issues:issues?[{key:'assembly:blocked',owner:'zhao',summary:'装配等待物料'}]:[]}];
 try{
 await seedTestMembers(db);await migrateExceptions(db);await seedTestMembers(db);await migrateExceptions(db);let [e]=await reconcileExceptions(db,'demo',facts(1));assert.equal(e.status,'open');assert.equal(e.version,1);
 await Promise.all([reconcileExceptions(db,'demo',facts(1)),reconcileExceptions(db,'demo',facts(1))]);assert.deepEqual(await listExceptions(db,manager),[e]);
 assert.deepEqual(await listExceptions(db,{...manager,tenant:'other'}),[]);
 const command={expectedVersion:e.version,status:'in_progress' as const,note:'开始处理'};
 await assert.rejects(transitionException(db,{...manager,tenant:'other'},e.id,command,'other'),/NOT_FOUND/);
 await assert.rejects(transitionException(db,{...manager,actor:'wang'},e.id,command,'wrong'),/FORBIDDEN/);
 await assert.rejects(transitionException(db,owner,e.id,{expectedVersion:1,owner:'wang',note:'转交'},'assign0'),/FORBIDDEN/);
 e=await transitionException(db,manager,e.id,{expectedVersion:1,owner:'wang',note:'转交结构负责人'},'assign1');
 [e]=await reconcileExceptions(db,'demo',facts(2));assert.equal(e.owner,'wang');assert.equal(e.version,3);
 await assert.rejects(transitionException(db,owner,e.id,{...command,expectedVersion:e.version},'former'),/FORBIDDEN/);
 const input={...command,expectedVersion:e.version};const outcomes=await Promise.allSettled(['race1','race2'].map(k=>transitionException(db,manager,e.id,input,k)));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.match(String((outcomes.find(r=>r.status==='rejected') as PromiseRejectedResult).reason),/VERSION_CONFLICT/);
 const index=outcomes.findIndex(r=>r.status==='fulfilled');e=(outcomes[index] as PromiseFulfilledResult<typeof e>).value;assert.deepEqual(await transitionException(db,manager,e.id,input,['race1','race2'][index]),e);
 await assert.rejects(transitionException(db,manager,e.id,{...input,note:'different'},['race1','race2'][index]),/IDEMPOTENCY_CONFLICT/);
 e=await transitionException(db,{...owner,actor:'wang'},e.id,{expectedVersion:e.version,status:'resolved',note:'已提交处理结果'},'resolved');
 await assert.rejects(transitionException(db,manager,e.id,{expectedVersion:e.version,status:'closed',note:'关闭'},'close0'),/SOURCE_NOT_CLEAR/);
 [e]=await reconcileExceptions(db,'demo',facts(3,false));assert.equal(e.status,'resolved');assert.equal(e.sourceClear,true);
 await assert.rejects(transitionException(db,{...owner,actor:'wang'},e.id,{expectedVersion:e.version,status:'closed',note:'关闭'},'close1'),/FORBIDDEN/);
 e=await transitionException(db,manager,e.id,{expectedVersion:e.version,status:'closed',note:'业务证据已消除，确认关闭'},'close2');const closedVersion=e.version;
 [e]=await reconcileExceptions(db,'demo',facts(2));assert.equal(e.version,closedVersion);assert.equal(e.status,'closed');
 [e]=await reconcileExceptions(db,'demo',facts(4));assert.equal(e.status,'open');assert.equal(e.sourceClear,false);assert.equal(e.owner,'wang');assert.equal(e.version,closedVersion+1);assert.equal(e.audit.at(-1)?.event,'reopened');assert.ok(e.audit.some(a=>a.event==='source_cleared'));
 [e]=await reconcileExceptions(db,'demo',facts(5,false));assert.equal(e.status,'open');assert.equal(e.sourceClear,true);
 await assert.rejects(reconcileExceptions(db,'demo',[...facts(6),{id:'B',version:1,issues:[{key:'bad',owner:'unknown',summary:'bad'}]}]),/VALIDATION_ERROR/);assert.deepEqual(await listExceptions(db,manager),[e]);
 await db.query(`CREATE FUNCTION reject_exception() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private diagnostic'; END; $$;CREATE TRIGGER reject_exception BEFORE UPDATE ON platform_exceptions FOR EACH ROW EXECUTE FUNCTION reject_exception();`);
 await assert.rejects(transitionException(db,manager,e.id,{expectedVersion:e.version,status:'resolved',note:'提交'},'rollback'),/^Error: SERVICE_UNAVAILABLE$/);assert.deepEqual(await listExceptions(db,manager),[e]);assert.equal((await db.query("SELECT count(*)::int n FROM exception_mutations WHERE key='rollback'")).rows[0].n,0);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
test('later observation detects calendar risk at unchanged business version and rejects stale observations',async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const admin=new Pool({connectionString});const schema='test_exception_clock_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});const principal={tenant:'demo',actor:'chen'};
 try{
 await seedTestMembers(db);await migrateExceptions(db);await seedTestMembers(db);await migrateExceptions(db);
 const snapshot=(day:string,issues:boolean,version=3)=>[{id:'calendar-order',version,observedAt:`2026-09-${day}T00:00:00+08:00`,issues:issues?[{key:'due:overdue',owner:'zhao',summary:'计划日期已过'}]:[]}];
 assert.deepEqual(await reconcileExceptions(db,'demo',snapshot('06',false)),[]);
 let [e]=await reconcileExceptions(db,'demo',snapshot('07',true));assert.equal(e.sourceVersion,3);assert.equal(e.sourceClear,false);
 e=await transitionException(db,principal,e.id,{expectedVersion:e.version,owner:'wang',note:'由结构负责人跟进'},'calendar-assign');
 assert.deepEqual(await reconcileExceptions(db,'demo',snapshot('07',true)),[e]);
 assert.deepEqual(await reconcileExceptions(db,'demo',snapshot('06',false)),[e]);
 assert.deepEqual(await reconcileExceptions(db,'demo',snapshot('06',false,4)),[e]);
 [e]=await reconcileExceptions(db,'demo',snapshot('08',true));assert.equal(e.owner,'wang');assert.equal(e.sourceVersion,3);assert.equal(e.sourceClear,false);
 assert.deepEqual(await reconcileExceptions(db,'demo',snapshot('07',false)),[e]);
 [e]=await reconcileExceptions(db,'demo',snapshot('09',false));assert.equal(e.sourceClear,true);assert.equal(e.status,'open');assert.equal(e.sourceVersion,3);
 await assert.rejects(reconcileExceptions(db,'demo',[{...snapshot('10',true)[0],observedAt:'invalid'}]),/VALIDATION_ERROR/);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
