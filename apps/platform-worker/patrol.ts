import {requireManager,managerActor} from '../platform-api/members.ts';
import type {Pool} from 'pg';
import {migrateNotifications,enqueueNotification} from './notifications.ts';
export interface PatrolPolicy {enabled:boolean;intervalMinutes:number;weekdays:number[];startHour:number;endHour:number;orderIds?:string[];escalationAfterHours?:number}
export interface PatrolObject {id:string;version:number;observedAt?:string;issues:{key:string;owner:string;summary:string}[]}
export function validatePolicy(value:unknown):asserts value is PatrolPolicy {
 const p=value as PatrolPolicy;
 if(!p||typeof p.enabled!=='boolean'||!Number.isInteger(p.intervalMinutes)||p.intervalMinutes<1||p.intervalMinutes>1440||!Array.isArray(p.weekdays)||!p.weekdays.length||p.weekdays.length>7||new Set(p.weekdays).size!==p.weekdays.length||p.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6)||!Number.isInteger(p.startHour)||!Number.isInteger(p.endHour)||p.startHour<0||p.endHour>24||p.startHour>=p.endHour||p.orderIds!==undefined&&(!Array.isArray(p.orderIds)||p.orderIds.length>200||new Set(p.orderIds).size!==p.orderIds.length||p.orderIds.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim()||x.length>120))||p.escalationAfterHours!==undefined&&(!Number.isInteger(p.escalationAfterHours)||p.escalationAfterHours<1||p.escalationAfterHours>720))throw new Error('VALIDATION_ERROR');
}
export function isPatrolWindow(p:PatrolPolicy,now:Date) {const local=new Date(now.getTime()+8*3600000);return p.enabled&&p.weekdays.includes(local.getUTCDay())&&local.getUTCHours()>=p.startHour&&local.getUTCHours()<p.endHour;}
export async function migratePatrol(db:Pool){await db.query(`
 CREATE TABLE IF NOT EXISTS patrol_policy(tenant text PRIMARY KEY,version integer NOT NULL,policy jsonb NOT NULL,next_run_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS patrol_runs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,policy_version integer NOT NULL,object_count integer NOT NULL,issue_count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS patrol_inbox(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,object_id text NOT NULL,source_version integer NOT NULL,issue_key text NOT NULL,owner text NOT NULL,summary text NOT NULL,business_date date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant,object_id,issue_key,business_date));
 `);await migrateNotifications(db);}
export async function savePolicy(db:Pool,principal:{tenant:string;actor:string},policy:unknown,expectedVersion:number) {
 await requireManager(db,principal);validatePolicy(policy);
 if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw new Error('VALIDATION_ERROR');
 const normalized={...policy,escalationAfterHours:policy.escalationAfterHours??24};
 const result=expectedVersion===0?await db.query('INSERT INTO patrol_policy(tenant,version,policy,updated_by) VALUES($1,1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',[principal.tenant,JSON.stringify(normalized),principal.actor]):await db.query('UPDATE patrol_policy SET version=version+1,policy=$3,updated_by=$4,updated_at=clock_timestamp(),next_run_at=now() WHERE tenant=$1 AND version=$2 RETURNING *',[principal.tenant,expectedVersion,JSON.stringify(normalized),principal.actor]);
 if(!result.rowCount)throw new Error('VERSION_CONFLICT');return result.rows[0];
}
// The callback receives only selected objects; absence of unselected objects is not clearance evidence.
export async function runPatrol(db:Pool,tenant:string,list:()=>Promise<PatrolObject[]>,reconcile?:(objects:PatrolObject[])=>Promise<unknown>) {
 const tx=await db.connect();
 try {await tx.query('BEGIN');
  const row=(await tx.query('SELECT *,now() AS evaluated_at FROM patrol_policy WHERE tenant=$1 AND next_run_at<=now() FOR UPDATE SKIP LOCKED',[tenant])).rows[0];
  if(!row||!isPatrolWindow(row.policy,row.evaluated_at)){await tx.query('COMMIT');return false;}
  validatePolicy(row.policy);const all=await list();const scope: string[]|undefined=row.policy.orderIds;const objects=scope?.length?all.filter(o=>scope.includes(o.id)):all;
  if(reconcile)await reconcile(objects);
  const hasExceptions=(await tx.query("SELECT to_regclass('platform_exceptions') AS relation")).rows[0].relation;
  let count=0;
  for(const o of objects){
   const exceptions=hasExceptions?(await tx.query('SELECT data FROM platform_exceptions WHERE tenant=$1 AND object_id=$2',[tenant,o.id])).rows.map(r=>r.data):[];
   const outstanding=exceptions.filter(e=>['open','in_progress'].includes(e.status));
   const issues=[...o.issues.map(issue=>({...issue,owner:exceptions.find(e=>e.issueKey===issue.key)?.owner??issue.owner})),...outstanding.filter(e=>!o.issues.some(i=>i.key===e.issueKey)).map(e=>({key:e.issueKey,owner:e.owner,summary:e.summary}))];
   await tx.query('UPDATE patrol_issue_state SET active=false WHERE tenant=$1 AND object_id=$2 AND NOT(issue_key=ANY($3::text[]))',[tenant,o.id,issues.map(i=>i.key)]);
   for(const issue of issues){
    const state=(await tx.query(`INSERT INTO patrol_issue_state(tenant,object_id,issue_key,first_seen_at) VALUES($1,$2,$3,$4) ON CONFLICT(tenant,object_id,issue_key) DO UPDATE SET first_seen_at=CASE WHEN patrol_issue_state.active THEN patrol_issue_state.first_seen_at ELSE EXCLUDED.first_seen_at END,episode=patrol_issue_state.episode+CASE WHEN patrol_issue_state.active THEN 0 ELSE 1 END,active=true RETURNING *`,[tenant,o.id,issue.key,row.evaluated_at])).rows[0];
    const inserted=o.issues.some(i=>i.key===issue.key)?await tx.query(`INSERT INTO patrol_inbox(tenant,object_id,source_version,issue_key,owner,summary,business_date) VALUES($1,$2,$3,$4,$5,$6,($7::timestamptz AT TIME ZONE 'Asia/Shanghai')::date) ON CONFLICT DO NOTHING RETURNING id`,[tenant,o.id,o.version,issue.key,issue.owner,issue.summary,row.evaluated_at]):{rowCount:0,rows:[]};count+=inserted.rowCount??0;
    if(inserted.rowCount)await enqueueNotification(tx,tenant,'patrol:'+inserted.rows[0].id,{orderId:o.id,issue:issue.key,summary:issue.summary,owner:issue.owner});
    const exception=exceptions.find(e=>e.issueKey===issue.key);
    if(new Date(row.evaluated_at).getTime()-new Date(state.first_seen_at).getTime()>=(row.policy.escalationAfterHours??24)*3600000&&!['resolved','closed'].includes(exception?.status)){
     const escalationOwner=await managerActor(tx,tenant);
     const escalation=await tx.query('INSERT INTO patrol_escalations(tenant,object_id,issue_key,episode,summary,owner) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id',[tenant,o.id,issue.key,state.episode,issue.summary,escalationOwner]);
     if(escalation.rowCount)await enqueueNotification(tx,tenant,'escalation:'+escalation.rows[0].id,{orderId:o.id,issue:issue.key,summary:issue.summary,owner:escalationOwner});
    }
   }
  }
  await tx.query('INSERT INTO patrol_runs(tenant,policy_version,object_count,issue_count) VALUES($1,$2,$3,$4)',[tenant,row.version,objects.length,count]);
  await tx.query("UPDATE patrol_policy SET next_run_at=now()+($2*interval '1 minute') WHERE tenant=$1",[tenant,row.policy.intervalMinutes]);
  await tx.query('COMMIT');return true;
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}


