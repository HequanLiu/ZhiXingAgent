import {seedTestMembers} from '../helpers/member-db.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrateJobs,enqueueAnalysis,claimAnalysis,failAnalysis,recoverAnalysis} from '../../apps/platform-worker/jobs.ts';

test('durable analysis deduplicates events, retries, recovers and stops after three attempts',async()=>{
  const db=new Pool({connectionString:'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform'});
  const schema='test_analysis_'+randomUUID().replaceAll('-','');
  const client=await db.connect();
  // Isolated schema prevents a running real Worker from consuming test jobs.
  const isolated=new Pool({connectionString:'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform',options:`-c search_path=${schema}`});
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await seedTestMembers(isolated);await migrateJobs(isolated);
    const tx=await isolated.connect();
    try {
      await tx.query('BEGIN');
      const event={event_id:'event-1',tenant:'test',object_id:'sample',version:1};
      await enqueueAnalysis(tx,event);await enqueueAnalysis(tx,event);
      await tx.query('COMMIT');
    } finally {tx.release();}
    assert.equal(Number((await isolated.query('SELECT count(*) FROM analysis_jobs')).rows[0].count),1);
    const first=await claimAnalysis(isolated);assert.equal(first?.attempts,1);
    assert.equal(await claimAnalysis(isolated),undefined);
    await failAnalysis(isolated,first!,'TEST_FAILURE');
    assert.equal(await claimAnalysis(isolated),undefined);
    await isolated.query('UPDATE analysis_jobs SET next_attempt_at=now()');
    const second=await claimAnalysis(isolated);assert.equal(second?.attempts,2);
    await recoverAnalysis(isolated);
    const third=await claimAnalysis(isolated);assert.equal(third?.attempts,3);
    await failAnalysis(isolated,third!,'TEST_FAILURE');
    assert.equal((await isolated.query('SELECT status FROM analysis_jobs')).rows[0].status,'failed');
    assert.equal(await claimAnalysis(isolated),undefined);
  } finally {
    await isolated.end();await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();await db.end();
  }
});

test('manual retry enforces scope, stale snapshot, single winner and immutable history',async()=>{
 const {retryAnalysis}=await import('../../apps/platform-worker/jobs.ts') as any;
 assert.equal(typeof retryAnalysis,'function');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const db=new Pool({connectionString});const schema='test_retry_'+randomUUID().replaceAll('-','');
 await db.query(`CREATE SCHEMA ${schema}`);const isolated=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
  await seedTestMembers(isolated);await migrateJobs(isolated);await seedTestMembers(isolated);await migrateJobs(isolated);
  await isolated.query(`INSERT INTO analysis_jobs(event_id,tenant,object_id,version,status,attempts,summary,observed_version,provider,model,run_id,receipts,error_code) VALUES('retry-1','demo','sample',1,'failed',3,'old',1,'minimax','M3','run-old','[]','MODEL_TIMEOUT')`);
  const stamp=async()=>(await isolated.query("SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS value FROM analysis_jobs")).rows[0].value;
  const input={eventId:'retry-1',expectedUpdatedAt:await stamp()};const manager={tenant:'demo',actor:'chen'};
  await assert.rejects(retryAnalysis(isolated,{tenant:'demo',actor:'wang'},input),/FORBIDDEN/);
  await assert.rejects(retryAnalysis(isolated,{tenant:'other',actor:'chen'},input),/NOT_FOUND/);
  await assert.rejects(retryAnalysis(isolated,manager,{...input,expectedUpdatedAt:'bad'}),/VALIDATION_ERROR/);
  await assert.rejects(retryAnalysis(isolated,manager,{...input,expectedUpdatedAt:'2000-01-01T00:00:00Z'}),/VERSION_CONFLICT/);
  assert.equal((await isolated.query('SELECT count(*) FROM analysis_retry_audit')).rows[0].count,'0');
  const results=await Promise.allSettled([retryAnalysis(isolated,manager,input),retryAnalysis(isolated,manager,input)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const row=(await isolated.query('SELECT * FROM analysis_jobs')).rows[0];assert.equal(row.status,'queued');assert.equal(row.attempts,0);
  for(const field of ['summary','observed_version','provider','model','run_id','receipts','error_code'])assert.equal(row[field],null);
  const audits=(await isolated.query('SELECT * FROM analysis_retry_audit')).rows;assert.equal(audits.length,1);assert.equal(audits[0].previous_run.run_id,'run-old');assert.equal(audits[0].actor,'chen');
  await assert.rejects(isolated.query('UPDATE analysis_retry_audit SET actor=$1',['wang']),/immutable/);
  await assert.rejects(isolated.query('DELETE FROM analysis_retry_audit'),/immutable/);
  await assert.rejects(retryAnalysis(isolated,manager,{...input,expectedUpdatedAt:await stamp()}),/ANALYSIS_NOT_FAILED/);
  for(const status of ['running','completed','retry']) {
   await isolated.query('UPDATE analysis_jobs SET status=$1,updated_at=clock_timestamp()',[status]);
   await assert.rejects(retryAnalysis(isolated,manager,{...input,expectedUpdatedAt:await stamp()}),/ANALYSIS_NOT_FAILED/);
  }
  await isolated.query("UPDATE analysis_jobs SET status='failed',attempts=3,updated_at=clock_timestamp()");
  await retryAnalysis(isolated,manager,{...input,expectedUpdatedAt:await stamp()});
  assert.equal((await isolated.query('SELECT count(*) FROM analysis_retry_audit')).rows[0].count,'2');
 }finally{await isolated.end();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});


test('old claim failure and completion cannot overwrite recovered or manually retried jobs',async()=>{
 const jobs=await import('../../apps/platform-worker/jobs.ts') as any;
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const db=new Pool({connectionString});const schema='test_fence_'+randomUUID().replaceAll('-','');
 await db.query(`CREATE SCHEMA ${schema}`);const isolated=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
  await seedTestMembers(isolated);await migrateJobs(isolated);
  await isolated.query("INSERT INTO analysis_jobs(event_id,tenant,object_id,version) VALUES('fenced','demo','sample',1)");
  const old=await claimAnalysis(isolated);await recoverAnalysis(isolated);
  const snapshot=async()=>(await isolated.query('SELECT to_jsonb(analysis_jobs) AS value FROM analysis_jobs')).rows[0].value;
  const recovered=await snapshot();
  await failAnalysis(isolated,old!,'STALE_FAILURE');assert.deepEqual(await snapshot(),recovered);
  const newer=await claimAnalysis(isolated);assert.notEqual((newer as any).claim_token,(old as any).claim_token);
  const current=await snapshot();
  const usage={inputTokens:12,outputTokens:3,totalTokens:15,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null,partial:false,cost:null};
  const output={summary:'new summary',observedVersion:1,provider:'test',model:'test',runId:'run',receipts:[],usage};
  assert.equal(await jobs.completeAnalysis(isolated,old,output),false);
  await failAnalysis(isolated,old!,'STALE_FAILURE');assert.deepEqual(await snapshot(),current);
  assert.equal(await jobs.completeAnalysis(isolated,newer,output),true);
  const completed=await snapshot();assert.deepEqual(completed.usage,usage);await failAnalysis(isolated,newer!,'LATE_FAILURE');assert.deepEqual(await snapshot(),completed);
  await isolated.query("UPDATE analysis_jobs SET status='failed',attempts=3,updated_at=clock_timestamp()");
  const stamp=(await isolated.query("SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS value FROM analysis_jobs")).rows[0].value;
  await jobs.retryAnalysis(isolated,{tenant:'demo',actor:'chen'},{eventId:'fenced',expectedUpdatedAt:stamp});
  const retried=await snapshot();assert.equal(retried.claim_token,null);assert.equal(retried.usage,null);assert.deepEqual((await isolated.query('SELECT previous_run FROM analysis_retry_audit')).rows[0].previous_run.usage,usage);
  assert.equal(await jobs.completeAnalysis(isolated,newer,output),false);await failAnalysis(isolated,newer!,'LATE_FAILURE');assert.deepEqual(await snapshot(),retried);
  const next=await claimAnalysis(isolated);assert.notEqual((next as any).claim_token,(newer as any).claim_token);
  const nextSnapshot=await snapshot();await failAnalysis(isolated,newer!,'LATE_FAILURE');assert.equal(await jobs.completeAnalysis(isolated,newer,output),false);assert.deepEqual(await snapshot(),nextSnapshot);
 }finally{await isolated.end();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});

test('manual retry rolls back unchanged when audit insert fails and hides database details',async()=>{
 const {retryAnalysis}=await import('../../apps/platform-worker/jobs.ts');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const db=new Pool({connectionString});const schema='test_audit_failure_'+randomUUID().replaceAll('-','');
 await db.query(`CREATE SCHEMA ${schema}`);const isolated=new Pool({connectionString,options:`-c search_path=${schema}`});
 try{
  await seedTestMembers(isolated);await migrateJobs(isolated);
  await isolated.query("INSERT INTO analysis_jobs(event_id,tenant,object_id,version,status,attempts,summary) VALUES('audit-fail','demo','sample',1,'failed',3,'preserve')");
  await isolated.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private database diagnostic'; END; $$;
   CREATE TRIGGER reject_test_audit BEFORE INSERT ON analysis_retry_audit FOR EACH ROW EXECUTE FUNCTION reject_test_audit();`);
  const before=(await isolated.query('SELECT to_jsonb(analysis_jobs) AS value FROM analysis_jobs')).rows[0].value;
  const stamp=(await isolated.query("SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS value FROM analysis_jobs")).rows[0].value;
  await assert.rejects(retryAnalysis(isolated,{tenant:'demo',actor:'chen'},{eventId:'audit-fail',expectedUpdatedAt:stamp}),/^Error: SERVICE_UNAVAILABLE$/);
  assert.deepEqual((await isolated.query('SELECT to_jsonb(analysis_jobs) AS value FROM analysis_jobs')).rows[0].value,before);
  assert.equal((await isolated.query('SELECT count(*) FROM analysis_retry_audit')).rows[0].count,'0');
 }finally{await isolated.end();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});

