import {assertManager,assertIdentity,activeOwner,isManager} from '../../packages/member-authorization/index.ts';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { createOrders, applyFeedback, assignOwner, acceptNode, returnNode } from './domain.ts';
import {newProject,configureProject,projectConfiguration,previewProjectBatch,type ProjectTemplate} from './project.ts';
import {evaluateSchedule} from './schedule.ts';
import type { Order, FeedbackInput, MutationInput } from '../../packages/sampling-contracts/index.ts';
export const pool = new Pool({ connectionString: process.env.BUSINESS_DATABASE_URL ?? 'postgresql://soundlab_business:business-local-only@127.0.0.1:55439/soundlab_business' });
export async function migrate(db:Pick<Pool,'query'>=pool) {
  await db.query(`CREATE TABLE IF NOT EXISTS orders(tenant text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(tenant,id));
    CREATE TABLE IF NOT EXISTS project_templates(tenant text NOT NULL,id text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(tenant,id));
    CREATE TABLE IF NOT EXISTS project_template_audit(sequence bigserial PRIMARY KEY,tenant text NOT NULL,template_id text NOT NULL,actor text NOT NULL,action text NOT NULL,before_data jsonb,after_data jsonb,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS mutations(tenant text NOT NULL, key text NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL, PRIMARY KEY(tenant,key));
    CREATE TABLE IF NOT EXISTS outbox(id text PRIMARY KEY, sequence bigserial UNIQUE NOT NULL, tenant text NOT NULL, object_id text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`);
  for (const order of createOrders()) await db.query('INSERT INTO orders VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [order.tenant,order.id,JSON.stringify(order)]);
}
export async function list(tenant: string): Promise<Order[]> {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return (await pool.query('SELECT data FROM orders WHERE tenant=$1 ORDER BY id', [tenant])).rows.map(r => {
    const order=r.data as Order;const schedule=evaluateSchedule(order,today);
    return {...order,schedule,forecast:schedule.forecast,risk:schedule.risk};
  });
}
export async function createProject(tenant:string,actor:string,key:string,input:unknown):Promise<Order> {
  const order=newProject(input,tenant,actor);
  if(!key||key.length>100)throw new Error('VALIDATION_ERROR');
  const fingerprint=createHash('sha256').update(JSON.stringify({actor,kind:'create',input})).digest('hex');
  const db=await pool.connect();
  try {
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[tenant]);
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[tenant+':'+key]);
    const previous=(await db.query('SELECT * FROM mutations WHERE tenant=$1 AND key=$2',[tenant,key])).rows[0];
    if(previous){if(previous.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_CONFLICT');await db.query('COMMIT');return previous.result;}
    const inserted=await db.query('INSERT INTO orders VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[tenant,order.id,JSON.stringify(order)]);
    if(!inserted.rowCount)throw new Error('ORDER_EXISTS');
    await db.query('INSERT INTO mutations VALUES($1,$2,$3,$4)',[tenant,key,fingerprint,JSON.stringify(order)]);
    await db.query('INSERT INTO outbox(id,tenant,object_id,version) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,order.id,order.version]);
    await db.query('COMMIT');return order;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function mutate(tenant: string, actor: string, id: string, key: string, kind: 'feedback'|'assign'|'accept'|'return', input: MutationInput): Promise<Order> {
  if (!key || key.length > 100) throw new Error('VALIDATION_ERROR');
  const db = await pool.connect();
  const fingerprint = createHash('sha256').update(JSON.stringify({ actor,id,kind,input })).digest('hex');
  try {
    await db.query('BEGIN');
    // Serialize event publication per tenant so a polling cursor cannot skip an earlier uncommitted sequence.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))', [tenant]);
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [tenant+':'+key]);
    const previous = (await db.query('SELECT * FROM mutations WHERE tenant=$1 AND key=$2', [tenant,key])).rows[0];
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
      await db.query('COMMIT'); return previous.result;
    }
    const row = (await db.query('SELECT data FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE', [tenant,id])).rows[0];
    if (!row) throw new Error('NOT_FOUND');
    const updated = kind === 'feedback' ? applyFeedback(row.data,input as FeedbackInput,actor) : kind==='return'?returnNode(row.data,input,actor):kind==='accept'?acceptNode(row.data,input,actor):assignOwner(row.data,input.nodeId,input.owner ?? '',input.expectedVersion,actor);
    await db.query('UPDATE orders SET data=$3 WHERE tenant=$1 AND id=$2', [tenant,id,JSON.stringify(updated)]);
    await db.query('INSERT INTO mutations VALUES($1,$2,$3,$4)',[tenant,key,fingerprint,JSON.stringify(updated)]);
    await db.query('INSERT INTO outbox(id,tenant,object_id,version) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,id,updated.version]);
    await db.query('COMMIT'); return updated;
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
export async function configureStoredProject(tenant:string,actor:string,id:string,key:string,input:unknown):Promise<Order> {
  assertIdentity({tenant,actor});assertManager(actor);
  if(!key||key.length>100)throw new Error('VALIDATION_ERROR');
  const fingerprint=createHash('sha256').update(JSON.stringify({actor,id,kind:'configure',input})).digest('hex');
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[tenant]);
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[tenant+':'+key]);
    const previous=(await db.query('SELECT * FROM mutations WHERE tenant=$1 AND key=$2',[tenant,key])).rows[0];
    if(previous){
      if(previous.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_CONFLICT');
      await db.query('COMMIT');return previous.result;
    }
    const row=(await db.query('SELECT data FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];
    if(!row)throw new Error('NOT_FOUND');
    const updated=configureProject(row.data,input,actor);
    await db.query('UPDATE orders SET data=$3 WHERE tenant=$1 AND id=$2',[tenant,id,JSON.stringify(updated)]);
    await db.query('INSERT INTO mutations VALUES($1,$2,$3,$4)',[tenant,key,fingerprint,JSON.stringify(updated)]);
    await db.query('INSERT INTO outbox(id,tenant,object_id,version) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,id,updated.version]);
    await db.query('COMMIT');return updated;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

function stableJSON(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableJSON((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
async function libraryMutation<T>(tenant:string,actor:string,key:string,kind:string,input:unknown,write:(db:import('pg').PoolClient)=>Promise<T>):Promise<T>{
 assertIdentity({tenant,actor});assertManager(actor);if(!key||key.length>100)throw new Error('VALIDATION_ERROR');
 const fingerprint=createHash('sha256').update(stableJSON({actor,kind,input})).digest('hex');const db=await pool.connect();
 try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[tenant]);
 const previous=(await db.query('SELECT * FROM mutations WHERE tenant=$1 AND key=$2',[tenant,key])).rows[0];
 if(previous){if(previous.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_CONFLICT');await db.query('COMMIT');return previous.result;}
 const result=await write(db);await db.query('INSERT INTO mutations VALUES($1,$2,$3,$4)',[tenant,key,fingerprint,JSON.stringify(result)]);await db.query('COMMIT');return result;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function createProjectBatch(tenant:string,actor:string,key:string,input:unknown):Promise<{orders:Order[]}>{
 return libraryMutation(tenant,actor,key,'project.batch',input,async db=>{
 if(!previewProjectBatch(input).valid)throw new Error('VALIDATION_ERROR');const orders=(input as unknown[]).map(value=>newProject(value,tenant,actor));
 for(const order of orders){const inserted=await db.query('INSERT INTO orders VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[tenant,order.id,JSON.stringify(order)]);if(!inserted.rowCount)throw new Error('ORDER_EXISTS');
 await db.query('INSERT INTO outbox(id,tenant,object_id,version) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,order.id,1]);}
 return {orders};});
}
export async function listProjectTemplates(tenant:string):Promise<ProjectTemplate[]>{return (await pool.query('SELECT data FROM project_templates WHERE tenant=$1 ORDER BY id',[tenant])).rows.map(row=>row.data);}
export async function saveProjectTemplate(tenant:string,actor:string,key:string,input:unknown):Promise<ProjectTemplate>{
 return libraryMutation(tenant,actor,key,'template.save',input,async db=>{
 const value=input as {id:string;name:string;expectedVersion?:number;project:unknown};
 if(!value||typeof value.id!=='string'||! /^[\w-]{1,60}$/.test(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.length>100)throw new Error('VALIDATION_ERROR');
 const project=projectConfiguration(value.project);const old=(await db.query('SELECT data FROM project_templates WHERE tenant=$1 AND id=$2 FOR UPDATE',[tenant,value.id])).rows[0]?.data as ProjectTemplate|undefined;
 if(old?value.expectedVersion!==old.version:value.expectedVersion!==undefined)throw new Error('VERSION_CONFLICT');
 const result={id:value.id,name:value.name.trim(),version:(old?.version??0)+1,project};
 await db.query('INSERT INTO project_templates VALUES($1,$2,$3) ON CONFLICT(tenant,id) DO UPDATE SET data=excluded.data',[tenant,value.id,JSON.stringify(result)]);
 await db.query('INSERT INTO project_template_audit(tenant,template_id,actor,action,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[tenant,value.id,actor,old?'update':'create',old?JSON.stringify(old):null,JSON.stringify(result)]);return result;});
}
export async function deleteProjectTemplate(tenant:string,actor:string,id:string,key:string,expectedVersion:number):Promise<{deleted:true}>{
 return libraryMutation(tenant,actor,key,'template.delete',{id,expectedVersion},async db=>{
 const old=(await db.query('SELECT data FROM project_templates WHERE tenant=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0]?.data;
 if(!old)throw new Error('NOT_FOUND');if(!Number.isInteger(expectedVersion))throw new Error('VALIDATION_ERROR');if(old.version!==expectedVersion)throw new Error('VERSION_CONFLICT');
 await db.query('DELETE FROM project_templates WHERE tenant=$1 AND id=$2',[tenant,id]);
 await db.query('INSERT INTO project_template_audit(tenant,template_id,actor,action,before_data) VALUES($1,$2,$3,$4,$5)',[tenant,id,actor,'delete',JSON.stringify(old)]);return {deleted:true};});
}

