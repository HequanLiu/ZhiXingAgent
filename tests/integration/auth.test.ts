import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';
import {migrateAuth,provisionUser,login,authenticate,logout} from '../../apps/platform-api/auth.ts';
test('sessions require provisioned tenant identity and expire or revoke without exposing password hashes',async()=>{
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';const admin=new Pool({connectionString});const schema='test_auth_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 try {
  await seedTestMembers(db);await migrateAuth(db);await provisionUser(db,{tenant:'one',username:'manager',actor:'chen',password:'temporary-test-password-123'});
  await assert.rejects(login(db,{tenant:'two',username:'manager',password:'temporary-test-password-123'}),/UNAUTHORIZED/);
  await assert.rejects(login(db,{tenant:'one',username:'manager',password:'wrong'}),/UNAUTHORIZED/);
  const session=await login(db,{tenant:'one',username:'manager',password:'temporary-test-password-123'});
  assert.equal((await authenticate(db,session.token)).actor,'chen');assert.equal((await authenticate(db,session.token)).role,'manager');
  const stored=(await db.query('SELECT token_hash FROM auth_sessions')).rows[0];assert.notEqual(stored.token_hash,session.token);
  await logout(db,session.token);await assert.rejects(authenticate(db,session.token),/UNAUTHORIZED/);
  const expired=await login(db,{tenant:'one',username:'manager',password:'temporary-test-password-123'});await db.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second'");await assert.rejects(authenticate(db,expired.token),/UNAUTHORIZED/);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
