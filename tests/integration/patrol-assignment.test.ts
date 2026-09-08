import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';
import {migratePatrol,runPatrol,savePolicy} from '../../apps/platform-worker/patrol.ts';
import {migrateExceptions,reconcileExceptions,transitionException} from '../../apps/platform-api/exceptions.ts';
test('patrol follows reassigned exception owner mapping while escalation remains with manager',async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const admin=new Pool({connectionString});const schema='test_assigned_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{await seedTestMembers(db);await migratePatrol(db);await seedTestMembers(db);await migrateExceptions(db);await db.query(`CREATE TABLE channel_identities(channel text,sender_id text,tenant text,actor text);INSERT INTO channel_identities VALUES('wecom','node-owner','demo','zhao'),('wecom','new-handler','demo','li'),('wecom','manager','demo','chen')`);
 await savePolicy(db,{tenant:'demo',actor:'chen'},{enabled:true,intervalMinutes:1,weekdays:[0,1,2,3,4,5,6],startHour:0,endHour:24,escalationAfterHours:1},0);
 const facts=[{id:'A',version:1,issues:[{key:'blocked',owner:'zhao',summary:'受阻'}]}];const [exception]=await reconcileExceptions(db,'demo',facts);await transitionException(db,{tenant:'demo',actor:'chen'},exception.id,{expectedVersion:exception.version,owner:'li',note:'经理重新分派跟进'},'assign-once');
 await runPatrol(db,'demo',async()=>facts,objects=>reconcileExceptions(db,'demo',objects));assert.equal((await db.query('SELECT owner FROM patrol_inbox')).rows[0].owner,'li');assert.deepEqual((await db.query('SELECT recipient,payload FROM notification_outbox')).rows.map(r=>({recipient:r.recipient,owner:r.payload.owner})),[{recipient:'new-handler',owner:'li'}]);
 await db.query("UPDATE patrol_issue_state SET first_seen_at=now()-interval '2 hours';UPDATE patrol_policy SET next_run_at=now()-interval '1 minute'");await runPatrol(db,'demo',async()=>facts);assert.deepEqual((await db.query('SELECT recipient,payload FROM notification_outbox ORDER BY id')).rows.map(r=>({recipient:r.recipient,owner:r.payload.owner})),[{recipient:'new-handler',owner:'li'},{recipient:'manager',owner:'chen'}]);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
