import {InstallationRegistry,migrateInstallations} from '../../apps/zhixing-api/installations.ts';
import {CapabilityGateway} from '../../apps/zhixing-api/gateway.ts';
import {migrateChangeTasks,delegateChange,runChangeTask} from '../../apps/zhixing-worker/change-tasks.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {saveMember,resolveMember,listMembers,createDirectoryPool} from '../../apps/zhixing-api/members.ts';
import {migrateAuth,provisionUser,login,authenticate} from '../../apps/zhixing-api/auth.ts';
import {migrateChannel,receiveFeedback} from '../../apps/zhixing-api/channel.ts';
test('directory changes serialize bootstrap and last manager, audit real actors, revoke sessions and channel identities',async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const admin=new Pool({connectionString});const schema='test_members_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 const p={tenant:'company',actor:'mgr-new'};const value={displayName:'新经理',role:'manager' as const,enabled:true,expectedVersion:0};
 try{await db.query(await readFile(new URL('../../migrations/platform/005-members.sql',import.meta.url),'utf8'));await migrateAuth(db);await migrateChannel(db);
 const race=await Promise.allSettled([saveMember(db,p,p.actor,value,true),saveMember(db,{...p,actor:'competitor'},'competitor',value,true)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 const manager=(await listMembers(db,p.tenant))[0];const principal={tenant:p.tenant,actor:manager.actor};
 await assert.rejects(saveMember(db,principal,manager.actor,{...value,enabled:false,expectedVersion:1}),/LAST_MANAGER_REQUIRED/);
 const worker=await saveMember(db,principal,'worker-new',{...value,displayName:'新员工',role:'member'});assert.equal(worker.role,'member');
 await assert.rejects(saveMember(db,{tenant:p.tenant,actor:worker.actor,role:'manager'},'forged',value),/FORBIDDEN/);
 await assert.rejects(resolveMember(db,{tenant:'foreign',actor:worker.actor}),/FORBIDDEN/);
 await assert.rejects(provisionUser(db,{tenant:p.tenant,actor:'missing',username:'missing',password:'local-test-password-123'}),/FORBIDDEN/);
 await provisionUser(db,{tenant:p.tenant,actor:worker.actor,username:'new-worker',password:'local-test-password-123'});const session=await login(db,{tenant:p.tenant,username:'new-worker',password:'local-test-password-123'});assert.equal((await authenticate(db,session.token)).actor,worker.actor);
 await db.query("INSERT INTO channel_identities VALUES('wecom','real-user',$1,$2)",[p.tenant,worker.actor]);let calls=0;const body={channel:'wecom',eventId:'1',senderId:'real-user',orderId:'ORDER',nodeId:'node',expectedVersion:1,mode:'percent',percent:100};
 await receiveFeedback(db,body,async identity=>{calls++;assert.equal(identity.actor,worker.actor);return {version:2};});
 await saveMember(db,principal,worker.actor,{...value,displayName:worker.displayName,role:'member',enabled:false,expectedVersion:1});
 await assert.rejects(authenticate(db,session.token),/FORBIDDEN/);await assert.rejects(receiveFeedback(db,{...body,eventId:'2'},async()=>{calls++;return{};}),/FORBIDDEN/);assert.equal(calls,1);
 await assert.rejects(provisionUser(db,{tenant:p.tenant,actor:worker.actor,username:'disabled',password:'local-test-password-123'}),/FORBIDDEN/);
 await assert.rejects(saveMember(db,principal,worker.actor,{...value,expectedVersion:1}),/VERSION_CONFLICT/);
 const audit=(await db.query('SELECT actor,target_actor FROM member_audit ORDER BY id')).rows;assert.equal(audit.length,3);assert.ok(audit.every(a=>a.actor===manager.actor));assert.equal(audit.at(-1).target_actor,worker.actor);await assert.rejects(db.query('DELETE FROM member_audit'),/immutable/);
 await db.query("INSERT INTO tenant_members VALUES('dirty','old','旧成员','member',false,1)");await assert.rejects(saveMember(db,{tenant:'dirty',actor:'bootstrap'},'bootstrap',value,true),/FORBIDDEN/);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

test('directory pool stays available when concurrent callbacks hold every application connection',{timeout:5000},async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const admin=new Pool({connectionString});const schema='test_members_pool_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,max:2,options:`-c search_path=${schema}`});const directory=createDirectoryPool(db);
 try{await db.query(await readFile(new URL('../../migrations/platform/005-members.sql',import.meta.url),'utf8'));await migrateChannel(db);await saveMember(db,{tenant:'pool-test',actor:'real-manager'},'real-manager',{displayName:'经理',role:'manager',enabled:true,expectedVersion:0},true);await db.query("INSERT INTO channel_identities VALUES('wecom','real-user','pool-test','real-manager')");let invoked=0;
 await migrateInstallations(db);const manifest={id:'test-members',version:'1',capabilities:[{id:'directory.read',version:'1',effect:'read' as const,input:{type:'object' as const}}]};const provider={invoke:async(_cap:string,_input:unknown,p:{tenant:string;actor:string})=>{await directory.query('SELECT pg_sleep(0.02)');const member=await resolveMember(directory,p);assert.equal(member.actor,'real-manager');invoked++;return{version:1};}};const registry=new InstallationRegistry(directory,manifest,{one:{label:'test',provider,capabilities:{'directory.read':'1'}}},'one');const gateway=new CapabilityGateway((cap,p)=>registry.resolve(cap,p));gateway.install('pool-test',manifest,{'directory.read':{version:'1',provider}});
 await Promise.all(Array.from({length:8},(_,i)=>receiveFeedback(db,{channel:'wecom',eventId:String(i),senderId:'real-user',orderId:'ORDER',nodeId:'node'},async p=>gateway.invoke('directory.read',{},p))));assert.equal(invoked,8);
 await migrateChangeTasks(db);const principal={tenant:'pool-test',actor:'real-manager'};let taskInvocations=0;const invoke=async()=>{taskInvocations++;return [{id:'approved',status:'approved',sourceVersion:1,planVersion:1}];};await delegateChange(db,principal,'approved',invoke);await saveMember(db,principal,'successor',{displayName:'后任经理',role:'manager',enabled:true,expectedVersion:0});await saveMember(db,principal,principal.actor,{displayName:'前任经理',role:'member',enabled:true,expectedVersion:1});await runChangeTask(db,invoke);assert.equal(taskInvocations,1);const task=(await db.query('SELECT status,error_code FROM change_tasks')).rows[0];assert.equal(task.status,'failed');assert.equal(task.error_code,'FORBIDDEN');
 }finally{await Promise.all([db.end(),directory.end()]);await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
