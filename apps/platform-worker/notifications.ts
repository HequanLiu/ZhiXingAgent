import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {SendResult} from '../platform-api/wecom-send.ts';
export const notificationsMigrationSql=`
CREATE TABLE IF NOT EXISTS patrol_issue_state(tenant text NOT NULL,object_id text NOT NULL,issue_key text NOT NULL,first_seen_at timestamptz NOT NULL,active boolean NOT NULL DEFAULT true,episode integer NOT NULL DEFAULT 1,PRIMARY KEY(tenant,object_id,issue_key));
CREATE TABLE IF NOT EXISTS patrol_escalations(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,object_id text NOT NULL,issue_key text NOT NULL,episode integer NOT NULL,owner text NOT NULL,summary text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant,object_id,issue_key,episode));
CREATE TABLE IF NOT EXISTS notification_outbox(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,dedupe_key text NOT NULL,payload jsonb NOT NULL,recipient text,status text NOT NULL CHECK(status IN ('pending','sending','sent','failed','unknown','skipped')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),claim_token text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant,dedupe_key));
CREATE TABLE IF NOT EXISTS notification_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,outbox_id bigint NOT NULL REFERENCES notification_outbox(id),event text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
`;
export async function migrateNotifications(db:Pool){await db.query(notificationsMigrationSql);}
export async function enqueueNotification(c:PoolClient,tenant:string,key:string,payload:{orderId:string;issue:string;summary:string;owner:string}){
 const hasMapping=(await c.query("SELECT to_regclass('channel_identities') AS relation")).rows[0].relation;
 const mappings=hasMapping?(await c.query("SELECT sender_id FROM channel_identities WHERE channel='wecom' AND tenant=$1 AND actor=$2 ORDER BY sender_id LIMIT 2",[tenant,payload.owner])).rows:[];
 const recipient=mappings.length===1?mappings[0].sender_id:null;
 const result=await c.query(`INSERT INTO notification_outbox(tenant,dedupe_key,payload,recipient,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,[tenant,key,{orderId:payload.orderId.slice(0,120),issue:payload.issue.slice(0,200),summary:payload.summary.slice(0,300),owner:payload.owner},recipient,recipient?'pending':'skipped']);
 if(result.rowCount)await c.query('INSERT INTO notification_audit(outbox_id,event) VALUES($1,$2)',[result.rows[0].id,recipient?'queued':'skipped_identity_unavailable']);
}
// Called only after acquiring the singleton worker advisory lock: a previous sending
// claim may have reached WeCom before crashing and must never be blindly retried.
export async function recoverNotifications(db:Pool){await db.query(`WITH recovered AS (UPDATE notification_outbox SET status='unknown',claim_token=NULL,updated_at=now() WHERE status='sending' RETURNING id) INSERT INTO notification_audit(outbox_id,event) SELECT id,'recovered_unknown' FROM recovered`);}
export async function dispatchNotification(db:Pool,sender:{sendText:(recipient:string,content:string)=>Promise<SendResult>},enabled:boolean){
 if(!enabled)return false;const token=randomUUID();
 const row=(await db.query(`WITH candidate AS (SELECT id FROM notification_outbox WHERE status IN ('pending','failed') AND attempts<3 AND next_attempt_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1), claimed AS (UPDATE notification_outbox o SET status='sending',claim_token=$1,attempts=attempts+1,updated_at=now() FROM candidate WHERE o.id=candidate.id RETURNING o.*), audit AS (INSERT INTO notification_audit(outbox_id,event) SELECT id,'claimed' FROM claimed) SELECT * FROM claimed`,[token])).rows[0];if(!row)return false;
 let result:SendResult;try{result=await sender.sendText(row.recipient,JSON.stringify(row.payload));}catch{result={status:'unknown'};}
 const status=result.status==='disabled'?'pending':result.status;
 await db.query(`WITH completed AS (UPDATE notification_outbox SET status=$3,claim_token=NULL,next_attempt_at=now()+(power(2,attempts)*interval '30 seconds'),updated_at=now() WHERE id=$1 AND claim_token=$2 AND status='sending' RETURNING id) INSERT INTO notification_audit(outbox_id,event) SELECT id,$3 FROM completed`,[row.id,token,status]);return true;
}
export async function readNotifications(db:Pool,tenant:string){return {escalations:(await db.query('SELECT id,object_id,issue_key,owner,summary,created_at FROM patrol_escalations WHERE tenant=$1 ORDER BY id DESC LIMIT 100',[tenant])).rows,notifications:(await db.query('SELECT id,payload,status,attempts,created_at,updated_at FROM notification_outbox WHERE tenant=$1 ORDER BY id DESC LIMIT 100',[tenant])).rows};}
