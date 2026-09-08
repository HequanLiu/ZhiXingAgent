import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';
import {migratePatrol,savePolicy,runPatrol} from '../../apps/zhixing-worker/patrol.ts';
import * as notifications from '../../apps/zhixing-worker/notifications.ts';
test('scoped patrol, escalation isolation, concurrent delivery fencing and unknown recovery',async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const admin=new Pool({connectionString});const schema='test_notifications_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{await seedTestMembers(db);await migratePatrol(db);await seedTestMembers(db);await notifications.migrateNotifications(db);await db.query('CREATE TABLE channel_identities(channel text,sender_id text,tenant text,actor text)');await db.query("INSERT INTO channel_identities VALUES('wecom','zhao-user','demo','zhao'),('wecom','chen-user','demo','chen')");
 const policy={enabled:true,intervalMinutes:1,weekdays:[0,1,2,3,4,5,6],startHour:0,endHour:24,orderIds:['A'],escalationAfterHours:1};await savePolicy(db,{tenant:'demo',actor:'chen'},policy,0);await savePolicy(db,{tenant:'other',actor:'chen'},policy,0);
 const facts=async()=>['A','B'].map(id=>({id,version:1,issues:[{key:'blocked',owner:'zhao',summary:'受阻'}]}));let reconciled:string[]=[];
 await runPatrol(db,'demo',facts,async objects=>{reconciled=objects.map(o=>o.id)});assert.deepEqual(reconciled,['A']);assert.deepEqual((await db.query('SELECT object_id FROM patrol_inbox')).rows,[{object_id:'A'}]);
 await db.query("UPDATE patrol_issue_state SET first_seen_at=now()-interval '2 hours';UPDATE patrol_policy SET next_run_at=now()-interval '1 minute'");await Promise.all([runPatrol(db,'demo',facts),runPatrol(db,'demo',facts)]);assert.equal((await db.query('SELECT count(*)::int n FROM patrol_escalations')).rows[0].n,1);
 await runPatrol(db,'other',facts);assert.equal((await db.query("SELECT count(*)::int n FROM notification_outbox WHERE tenant='other' AND status='skipped'")).rows[0].n,1);
 let calls=0;const sender={sendText:async()=>{calls++;return {status:'unknown' as const}}};await notifications.dispatchNotification(db,sender,false);assert.equal(calls,0);
 await Promise.all([notifications.dispatchNotification(db,sender,true),notifications.dispatchNotification(db,sender,true)]);assert.equal(calls,2);assert.equal((await db.query("SELECT count(*)::int n FROM notification_outbox WHERE status='unknown'")).rows[0].n,2);await notifications.dispatchNotification(db,sender,true);assert.equal(calls,2);
 await db.query("UPDATE notification_outbox SET status='sending',claim_token='stale' WHERE tenant='demo'");await notifications.recoverNotifications(db);assert.equal((await db.query("SELECT count(*)::int n FROM notification_outbox WHERE status='unknown'")).rows[0].n,2);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
