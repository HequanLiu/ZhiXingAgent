import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';
import {migratePatrol,savePolicy,runPatrol} from '../../apps/platform-worker/patrol.ts';
test('patrol persists configuration, deduplicates reminders and survives stale workers',async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const admin=new Pool({connectionString});const schema='test_patrol_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
  await seedTestMembers(db);await migratePatrol(db);const policy={enabled:true,intervalMinutes:1,weekdays:[0,1,2,3,4,5,6],startHour:0,endHour:24};
  await assert.rejects(savePolicy(db,{tenant:'demo',actor:'zhao'},policy,0),/FORBIDDEN/);
  await savePolicy(db,{tenant:'demo',actor:'chen'},policy,0);
  await assert.rejects(savePolicy(db,{tenant:'demo',actor:'chen'},policy,0),/VERSION_CONFLICT/);
  const list=async()=>[{id:'A',version:1,issues:[{key:'n:blocked',owner:'zhao',summary:'节点受阻'}]}];
  await runPatrol(db,'demo',list);assert.equal((await db.query('SELECT count(*)::int n FROM patrol_inbox')).rows[0].n,1);
  await db.query("UPDATE patrol_policy SET next_run_at=now()-interval '1 minute'");
  await Promise.all([runPatrol(db,'demo',list),runPatrol(db,'demo',list)]);
  assert.equal((await db.query('SELECT count(*)::int n FROM patrol_inbox')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM patrol_runs')).rows[0].n,2);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
