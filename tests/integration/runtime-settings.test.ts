import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
const settings={route:'minimax',enabled:false,initializeTimeoutMs:30000,requestTimeoutMs:60000,runTimeoutMs:90000,analysisIntervalMs:5000};
test('admin settings persist safely with replay, optimistic race, immutable audit and tenant policy',async()=>{
 const mod=await import('../../apps/platform-worker/runtime-settings.ts');
 assert.equal(typeof mod.saveRuntimeSettings,'function');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const db=new Pool({connectionString});const schema='test_settings_'+randomUUID().replaceAll('-','');
 await db.query(`CREATE SCHEMA ${schema}`);const isolated=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
  await seedTestMembers(isolated);await mod.migrateRuntimeSettings(isolated);await seedTestMembers(isolated);await mod.migrateRuntimeSettings(isolated);
  assert.deepEqual(await mod.readRuntimeSettings(isolated,'demo'),{version:0,settings:null});
  const input={expectedVersion:0,settings};const manager={tenant:'demo',actor:'chen'};
  await assert.rejects(mod.saveRuntimeSettings(isolated,{tenant:'demo',actor:'wang'},input,'key-1'),/^Error: FORBIDDEN$/);
  await assert.rejects(mod.saveRuntimeSettings(isolated,{tenant:'other',actor:'chen'},input,'key-1'),/^Error: FORBIDDEN$/);
  await assert.rejects(mod.readRuntimeSettings(isolated,'other'),/^Error: FORBIDDEN$/);
  await assert.rejects(mod.saveRuntimeSettings(isolated,manager,{...input,settings:{...settings,apiKey:'private'}},'key-1'),/^Error: VALIDATION_ERROR$/);
  const saved=await mod.saveRuntimeSettings(isolated,manager,input,'key-1');assert.deepEqual(saved,{version:1,settings});
  assert.deepEqual(await mod.saveRuntimeSettings(isolated,manager,input,'key-1'),saved);
  await assert.rejects(mod.saveRuntimeSettings(isolated,manager,{...input,settings:{...settings,enabled:true}},'key-1'),/^Error: IDEMPOTENCY_CONFLICT$/);
  const next={expectedVersion:1,settings:{...settings,route:'deepseek'}};
  const race=await Promise.allSettled([mod.saveRuntimeSettings(isolated,manager,next,'race-1'),mod.saveRuntimeSettings(isolated,manager,next,'race-2')]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal((race.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.message,'VERSION_CONFLICT');
  assert.equal((await mod.readRuntimeSettings(isolated,'demo')).version,2);
  assert.deepEqual(await mod.saveRuntimeSettings(isolated,manager,input,'key-1'),saved);
  const audit=(await isolated.query('SELECT * FROM runtime_settings_audit ORDER BY id')).rows;assert.equal(audit.length,2);assert.equal(audit[0].previous_settings,null);assert.deepEqual(audit[0].new_settings,settings);assert.deepEqual(audit[1].previous_settings,settings);
  await assert.rejects(isolated.query('UPDATE runtime_settings_audit SET actor=$1',['wang']),/immutable/);
  await assert.rejects(isolated.query('DELETE FROM runtime_settings_audit'),/immutable/);
  await assert.rejects(isolated.query('TRUNCATE runtime_settings_audit'),/immutable/);
  assert.equal(JSON.stringify(await mod.readRuntimeSettings(isolated,'demo')).includes('private'),false);
 }finally{await isolated.end();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});


test('settings database errors remain safe and audit insert failure rolls back the save',async()=>{
 const mod=await import('../../apps/platform-worker/runtime-settings.ts');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const db=new Pool({connectionString});const schema='test_settings_rollback_'+randomUUID().replaceAll('-','');
 await db.query(`CREATE SCHEMA ${schema}`);const isolated=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
  await seedTestMembers(isolated);await mod.migrateRuntimeSettings(isolated);
  await isolated.query(`CREATE FUNCTION reject_settings_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private diagnostic'; END; $$;
   CREATE TRIGGER reject_settings_insert BEFORE INSERT ON runtime_settings_audit FOR EACH ROW EXECUTE FUNCTION reject_settings_insert();`);
  await assert.rejects(mod.saveRuntimeSettings(isolated,{tenant:'demo',actor:'chen'},{expectedVersion:0,settings},'rollback'),/^Error: SERVICE_UNAVAILABLE$/);
  assert.deepEqual(await mod.readRuntimeSettings(isolated,'demo'),{version:0,settings:null});
  assert.equal((await isolated.query('SELECT count(*) FROM runtime_settings_audit')).rows[0].count,'0');
  await isolated.query('DROP TRIGGER reject_settings_insert ON runtime_settings_audit');
  const command={expectedVersion:0,settings};const manager={tenant:'demo',actor:'chen'};
  const same=await Promise.all([mod.saveRuntimeSettings(isolated,manager,command,'same'),mod.saveRuntimeSettings(isolated,manager,command,'same')]);
  assert.deepEqual(same[0],same[1]);assert.equal((await isolated.query('SELECT count(*) FROM runtime_settings_audit')).rows[0].count,'1');
  await isolated.query('ALTER TABLE runtime_settings RENAME TO unavailable_settings');
  await assert.rejects(mod.readRuntimeSettings(isolated,'demo'),/^Error: SERVICE_UNAVAILABLE$/);
  await assert.rejects(mod.saveRuntimeSettings(isolated,manager,{expectedVersion:1,settings},'offline'),/^Error: SERVICE_UNAVAILABLE$/);
 }finally{await isolated.end();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});


test('malicious persisted endpoint is rejected on read before a worker can apply it',async()=>{
 const mod=await import('../../apps/platform-worker/runtime-settings.ts');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const db=new Pool({connectionString});const schema='test_settings_endpoint_'+randomUUID().replaceAll('-','');
 await db.query(`CREATE SCHEMA ${schema}`);const isolated=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
  await seedTestMembers(isolated);await mod.migrateRuntimeSettings(isolated);
  const malicious={...settings,baseURL:'https://attacker.example/v1'};
  await assert.rejects(mod.saveRuntimeSettings(isolated,{tenant:'demo',actor:'chen'},{expectedVersion:0,settings:malicious},'bad-endpoint'),/^Error: VALIDATION_ERROR$/);
  await isolated.query('UPDATE runtime_settings SET settings=$1,version=1 WHERE tenant=$2',[JSON.stringify(malicious),'demo']);
  await assert.rejects(mod.readRuntimeSettings(isolated,'demo'),/^Error: SERVICE_UNAVAILABLE$/);
 }finally{await isolated.end();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});
