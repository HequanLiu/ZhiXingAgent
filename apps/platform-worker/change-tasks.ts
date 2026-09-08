import {requireManager,managerActor} from '../platform-api/members.ts';
import {randomUUID} from 'node:crypto';import type {Pool} from 'pg';import type {Principal} from '../../packages/platform-contracts/index.ts';
type Invoke=(capability:string,input:any,principal:Principal,key?:string)=>Promise<any>;
function completedReceipt(receipt:any,changeId:string){if(!receipt||receipt.status!=='completed'||receipt.changeId!==changeId||typeof receipt.id!=='string'||!receipt.id||!receipt.result||!Number.isInteger(receipt.result.version)||receipt.result.version<1)throw new Error('EXECUTION_RESULT_UNKNOWN');return receipt;}
export async function migrateChangeTasks(db:Pick<Pool,'query'>){await db.query(`CREATE TABLE IF NOT EXISTS change_tasks(id text PRIMARY KEY,tenant text NOT NULL,change_id text NOT NULL,actor text NOT NULL,snapshot jsonb NOT NULL,status text NOT NULL,claim_token text,attempts integer NOT NULL DEFAULT 0,result jsonb,error_code text,next_run_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant,change_id));
 CREATE TABLE IF NOT EXISTS change_task_audit(id bigserial PRIMARY KEY,task_id text NOT NULL,tenant text NOT NULL,status text NOT NULL,error_code text,created_at timestamptz NOT NULL DEFAULT now());`);}
export async function delegateChange(db:Pool,p:Principal,id:string,invoke:Invoke){
 await requireManager(db,p);if(typeof id!=='string'||!id||id.length>100)throw new Error('VALIDATION_ERROR');
 const plans=await invoke('sampling.changes.list',{},p);const plan=plans.find((x:any)=>x.id===id);if(!plan)throw new Error('NOT_FOUND');
 if(!['proposed','approved','applied'].includes(plan.status))throw new Error('CHANGE_NOT_APPROVED');
 const task=(await db.query("INSERT INTO change_tasks(id,tenant,change_id,actor,snapshot,status) VALUES($1,$2,$3,$4,$5,'awaiting_approval') ON CONFLICT(tenant,change_id) DO NOTHING RETURNING *",[randomUUID(),p.tenant,id,p.actor,JSON.stringify(plan)])).rows[0];
 return task??(await db.query('SELECT * FROM change_tasks WHERE tenant=$1 AND change_id=$2',[p.tenant,id])).rows[0];
}
export async function runChangeTask(db:Pool,invoke:Invoke){
 // Expired owners are fenced; the next claimant checks the durable business receipt first.
 await db.query("UPDATE change_tasks SET status='unknown',claim_token=NULL WHERE status='running' AND updated_at<now()-interval '2 minutes'");
 const token=randomUUID();const job=(await db.query("UPDATE change_tasks SET status='running',claim_token=$1,updated_at=clock_timestamp() WHERE id=(SELECT id FROM change_tasks WHERE status IN('awaiting_approval','unknown') AND next_run_at<=now() ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",[token])).rows[0];if(!job)return false;
 const p={tenant:job.tenant,actor:job.actor};const key='approved-task-'+job.id;
 let status='unknown',result:any=null,errorCode:string|null=null,attempts=job.attempts;
 try{
  await requireManager(db,p);
  try{result=completedReceipt(await invoke('sampling.invocation.get',{key},p),job.change_id);status='succeeded';}
  catch(error){if((error as Error).message!=='NOT_FOUND')throw error;
   const plans=await invoke('sampling.changes.list',{},p);const plan=plans.find((x:any)=>x.id===job.change_id);if(!plan)throw Error('NOT_FOUND');
   if(plan.status==='rejected'){status='rejected';}
   else if(plan.status==='proposed'){status='awaiting_approval';}
   else if(plan.status==='applied'){status='succeeded';result={status:'applied_elsewhere',changeId:plan.id};}
   else if(plan.status==='approved'){
    if(plan.sourceVersion!==job.snapshot.sourceVersion||plan.planVersion!==job.snapshot.planVersion)throw Error('VERSION_CONFLICT');
    attempts++;result=completedReceipt(await invoke('sampling.change.apply',{id:job.change_id},p,key),job.change_id);status='succeeded';
   }else throw Error('CHANGE_NOT_APPROVED');
  }
 }catch(error){const code=(error as Error).message;errorCode=['VERSION_CONFLICT','NOT_FOUND','FORBIDDEN','CHANGE_NOT_APPROVED'].includes(code)?code:'EXECUTION_RESULT_UNKNOWN';status=errorCode==='EXECUTION_RESULT_UNKNOWN'?(attempts>=3?'needs_attention':'unknown'):'failed';}
 const tx=await db.connect();try{await tx.query('BEGIN');const updated=await tx.query("UPDATE change_tasks SET status=$3,result=$4,error_code=$5,attempts=$6,claim_token=NULL,updated_at=clock_timestamp(),next_run_at=now()+interval '15 seconds' WHERE id=$1 AND claim_token=$2 AND status='running' RETURNING id",[job.id,token,status,result?JSON.stringify(result):null,errorCode,attempts]);if(updated.rowCount)await tx.query('INSERT INTO change_task_audit(task_id,tenant,status,error_code) VALUES($1,$2,$3,$4)',[job.id,job.tenant,status,errorCode]);await tx.query('COMMIT');}catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}return true;
}
