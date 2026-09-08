import {requireManager,managerActor} from '../zhixing-api/members.ts';
import type {Pool,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import type {ModelResult} from '../../packages/runtime-deepseek/index.mjs';
import {retryState} from '../../packages/runtime-deepseek/result.mjs';
export interface AnalysisJob {event_id:string;tenant:string;object_id:string;version:number;attempts:number;claim_token:string}
export async function migrateJobs(db:Pool) {
  await db.query(`CREATE TABLE IF NOT EXISTS analysis_jobs(
    event_id text PRIMARY KEY,tenant text NOT NULL,object_id text NOT NULL,version integer NOT NULL,
    status text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    summary text,observed_version integer,provider text,model text,run_id text,receipts jsonb,error_code text);
    ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS claim_token text;
    ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS usage jsonb;
    CREATE TABLE IF NOT EXISTS analysis_retry_audit(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_id text NOT NULL,tenant text NOT NULL,actor text NOT NULL,
      retried_at timestamptz NOT NULL DEFAULT clock_timestamp(),previous_run jsonb NOT NULL);
    CREATE OR REPLACE FUNCTION reject_analysis_retry_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'analysis retry audit is immutable'; END; $$;
    DROP TRIGGER IF EXISTS analysis_retry_audit_immutable ON analysis_retry_audit;
    CREATE TRIGGER analysis_retry_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON analysis_retry_audit
      FOR EACH STATEMENT EXECUTE FUNCTION reject_analysis_retry_audit_change();
    CREATE TABLE IF NOT EXISTS worker_status(name text PRIMARY KEY,model text NOT NULL,enabled boolean NOT NULL,heartbeat_at timestamptz NOT NULL);`);
}
export async function enqueueAnalysis(client:PoolClient,event:AnalysisJob|Omit<AnalysisJob,'attempts'|'claim_token'>) {
  await client.query(`INSERT INTO analysis_jobs(event_id,tenant,object_id,version) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING`,[event.event_id,event.tenant,event.object_id,event.version]);
}
export async function claimAnalysis(db:Pool):Promise<AnalysisJob|undefined> {
  return (await db.query(`UPDATE analysis_jobs SET status='running',attempts=attempts+1,updated_at=clock_timestamp(),error_code=NULL,claim_token=$1
    WHERE event_id=(SELECT event_id FROM analysis_jobs WHERE status IN ('queued','retry') AND next_attempt_at<=now()
    ORDER BY next_attempt_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[randomUUID()])).rows[0];
}
export async function failAnalysis(db:Pool,job:AnalysisJob,code:string):Promise<boolean> {
  const retry=retryState(job.attempts);
  const result=await db.query(`UPDATE analysis_jobs SET status=$2,error_code=$3,next_attempt_at=now()+$4*interval '1 second',updated_at=clock_timestamp(),claim_token=NULL
    WHERE event_id=$1 AND tenant=$5 AND claim_token=$6 AND status='running'`,
    [job.event_id,retry.status,code,retry.delaySeconds,job.tenant,job.claim_token]);
  return result.rowCount===1;
}
export async function completeAnalysis(db:Pool,job:AnalysisJob,result:ModelResult&{observedVersion:number}):Promise<boolean> {
  const updated=await db.query(`UPDATE analysis_jobs SET status='completed',summary=$2,observed_version=$3,
    provider=$4,model=$5,run_id=$6,receipts=$7,usage=$10,error_code=NULL,updated_at=clock_timestamp(),claim_token=NULL
    WHERE event_id=$1 AND tenant=$8 AND claim_token=$9 AND status='running'`,
    [job.event_id,result.summary,result.observedVersion,result.provider,result.model,result.runId,JSON.stringify(result.receipts),job.tenant,job.claim_token,result.usage==null?null:JSON.stringify(result.usage)]);
  return updated.rowCount===1;
}
// A replacement owns the session lock; invalidating tokens fences cleanup from the old process.
export async function recoverAnalysis(db:Pool) {
  await db.query(`UPDATE analysis_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry' END,
    error_code='WORKER_RESTARTED',claim_token=NULL,next_attempt_at=now(),updated_at=clock_timestamp() WHERE status='running'`);
}

export interface RetryAnalysisInput {eventId:string;expectedUpdatedAt:string}
export async function retryAnalysis(db:Pool,principal:{tenant:string;actor:string},input:RetryAnalysisInput):Promise<{event_id:string;status:'queued';updated_at:string}> {
  // This local demo uses the same manager identity as the reference business service.
  await requireManager(db,principal);
  if(!input||typeof input.eventId!=='string'||!input.eventId.trim()||input.eventId.length>200||typeof input.expectedUpdatedAt!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(input.expectedUpdatedAt)||!Number.isFinite(Date.parse(input.expectedUpdatedAt)))throw new Error('VALIDATION_ERROR');
  let client:PoolClient|undefined;
  try {
    client=await db.connect();await client.query('BEGIN');
    const row=(await client.query(`SELECT *,updated_at=$3::timestamptz AS matches FROM analysis_jobs WHERE event_id=$1 AND tenant=$2 FOR UPDATE`,[input.eventId,principal.tenant,input.expectedUpdatedAt])).rows[0];
    if(!row)throw new Error('NOT_FOUND');
    if(!row.matches)throw new Error('VERSION_CONFLICT');
    if(row.status!=='failed')throw new Error('ANALYSIS_NOT_FAILED');
    await client.query(`INSERT INTO analysis_retry_audit(event_id,tenant,actor,previous_run)
      SELECT event_id,tenant,$3,to_jsonb(analysis_jobs) FROM analysis_jobs WHERE event_id=$1 AND tenant=$2`,[input.eventId,principal.tenant,principal.actor]);
    const result=(await client.query(`UPDATE analysis_jobs SET status='queued',attempts=0,claim_token=NULL,next_attempt_at=clock_timestamp(),
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond'),summary=NULL,observed_version=NULL,provider=NULL,model=NULL,run_id=NULL,receipts=NULL,usage=NULL,error_code=NULL
      WHERE event_id=$1 AND tenant=$2 RETURNING event_id,status,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`,[input.eventId,principal.tenant])).rows[0];
    await client.query('COMMIT');return result;
  }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    const code=error instanceof Error?error.message:'';
    throw new Error(['NOT_FOUND','VERSION_CONFLICT','ANALYSIS_NOT_FAILED'].includes(code)?code:'SERVICE_UNAVAILABLE');
  }finally{client?.release();}
}



