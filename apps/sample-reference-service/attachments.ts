import {assertManager,assertIdentity,activeOwner,isManager} from '../../packages/member-authorization/index.ts';
import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {type Order} from '../../packages/sampling-contracts/index.ts';

export interface AttachmentPrincipal {tenant:string;actor:string}
export interface AttachmentInput {orderId:string;nodeId:string;expectedVersion:number;filename:string;mime:string;base64:string}
export interface AttachmentMetadata {id:string;tenant:string;orderId:string;nodeId:string;actor:string;sourceVersion:number;filename:string;mime:string;size:number;sha256:string;uploadedAt:string}
const MAX_BYTES=2*1024*1024;
const codes=new Set(['VALIDATION_ERROR','ATTACHMENT_TOO_LARGE','ATTACHMENT_LIMIT','FORBIDDEN','NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','NODE_CLOSED']);
function safe(error:unknown){return error instanceof Error&&codes.has(error.message)?error:new Error('SERVICE_UNAVAILABLE');}
function principal(p:AttachmentPrincipal){assertIdentity(p);if(!p||typeof p.tenant!=='string'||!p.tenant.trim()||p.tenant.length>100||!activeOwner(p.actor))throw new Error('FORBIDDEN');}
function identifier(id:unknown):asserts id is string {if(typeof id!=='string'||!id.trim()||id.length>100)throw new Error('VALIDATION_ERROR');}
export function validateAttachmentInput(raw:unknown):{input:AttachmentInput;data:Buffer}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('VALIDATION_ERROR');
 const input=raw as AttachmentInput;
 if(Object.keys(raw).some(k=>!['orderId','nodeId','expectedVersion','filename','mime','base64'].includes(k))||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1||typeof input.filename!=='string'||!input.filename.trim()||input.filename.length>120||/[\\/:\x00-\x1f\x7f]/.test(input.filename)||['.','..'].includes(input.filename)||typeof input.base64!=='string')throw new Error('VALIDATION_ERROR');
 identifier(input.orderId);identifier(input.nodeId);
 if(input.base64.length>4*Math.ceil(MAX_BYTES/3))throw new Error('ATTACHMENT_TOO_LARGE');
 if(!input.base64.length||input.base64.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))throw new Error('VALIDATION_ERROR');
 const data=Buffer.from(input.base64,'base64');
 if(data.length>MAX_BYTES)throw new Error('ATTACHMENT_TOO_LARGE');
 if(data.toString('base64')!==input.base64)throw new Error('VALIDATION_ERROR');
 const valid=input.mime==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):input.mime==='image/jpeg'?data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255:input.mime==='application/pdf'?data.subarray(0,5).toString('ascii')==='%PDF-':false;
 if(!valid)throw new Error('VALIDATION_ERROR');
 return {input:{orderId:input.orderId,nodeId:input.nodeId,expectedVersion:input.expectedVersion,filename:input.filename,mime:input.mime,base64:input.base64},data};
}
export async function migrateAttachments(db:Pool){await db.query(`CREATE TABLE IF NOT EXISTS sampling_attachments(id text PRIMARY KEY,tenant text NOT NULL,order_id text NOT NULL,node_id text NOT NULL,actor text NOT NULL,source_version integer NOT NULL,filename text NOT NULL,mime text NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=2097152),sha256 text NOT NULL,uploaded_at timestamptz NOT NULL DEFAULT now(),data bytea NOT NULL,CHECK(octet_length(data)=size));
 CREATE INDEX IF NOT EXISTS sampling_attachments_order_idx ON sampling_attachments(tenant,order_id);
 CREATE OR REPLACE FUNCTION guard_sampling_attachment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'attachment immutable'; END; $$;
 DROP TRIGGER IF EXISTS guard_sampling_attachment ON sampling_attachments;CREATE TRIGGER guard_sampling_attachment BEFORE UPDATE OR DELETE ON sampling_attachments FOR EACH ROW EXECUTE FUNCTION guard_sampling_attachment();`);}
const columns='id,tenant,order_id,node_id,actor,source_version,filename,mime,size,sha256,uploaded_at';
function metadata(row:any):AttachmentMetadata{return {id:row.id,tenant:row.tenant,orderId:row.order_id,nodeId:row.node_id,actor:row.actor,sourceVersion:row.source_version,filename:row.filename,mime:row.mime,size:row.size,sha256:row.sha256,uploadedAt:new Date(row.uploaded_at).toISOString()};}
export async function uploadAttachment(db:Pool,p:AttachmentPrincipal,raw:unknown,key:string):Promise<AttachmentMetadata>{
 principal(p);identifier(key);const {input,data}=validateAttachmentInput(raw);
 const sha256=createHash('sha256').update(data).digest('hex');
 const fingerprint=createHash('sha256').update(JSON.stringify({kind:'upload-attachment',actor:p.actor,orderId:input.orderId,nodeId:input.nodeId,expectedVersion:input.expectedVersion,filename:input.filename,mime:input.mime,sha256})).digest('hex');
 let c:PoolClient|undefined;
 try{
  c=await db.connect();await c.query('BEGIN');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[p.tenant]);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[p.tenant+':'+key]);
  const old=(await c.query('SELECT fingerprint,result FROM mutations WHERE tenant=$1 AND key=$2',[p.tenant,key])).rows[0];
  if(old){if(old.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_CONFLICT');await c.query('COMMIT');return old.result;}
  const row=(await c.query('SELECT data FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE',[p.tenant,input.orderId])).rows[0];
  if(!row)throw new Error('NOT_FOUND');const order=row.data as Order;
  if(order.version!==input.expectedVersion)throw new Error('VERSION_CONFLICT');
  const node=order.nodes.find(n=>n.id===input.nodeId);if(!node)throw new Error('NOT_FOUND');
  if(!isManager(p.actor)&&node.owner!==p.actor)throw new Error('FORBIDDEN');
  if(node.status==='accepted')throw new Error('NODE_CLOSED');
  const totals=(await c.query('SELECT count(*) AS count,coalesce(sum(size),0) AS bytes FROM sampling_attachments WHERE tenant=$1 AND order_id=$2',[p.tenant,input.orderId])).rows[0];
  if(Number(totals.count)>=50||Number(totals.bytes)+data.length>10*1024*1024)throw new Error('ATTACHMENT_LIMIT');
  const inserted=(await c.query(`INSERT INTO sampling_attachments(id,tenant,order_id,node_id,actor,source_version,filename,mime,size,sha256,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${columns}`,[randomUUID(),p.tenant,input.orderId,input.nodeId,p.actor,order.version,input.filename,input.mime,data.length,sha256,data])).rows[0];
  const result=metadata(inserted);const updated={...order,version:order.version+1};
  await c.query('UPDATE orders SET data=$3 WHERE tenant=$1 AND id=$2',[p.tenant,input.orderId,JSON.stringify(updated)]);
  await c.query('INSERT INTO mutations VALUES($1,$2,$3,$4)',[p.tenant,key,fingerprint,JSON.stringify(result)]);
  await c.query('INSERT INTO outbox(id,tenant,object_id,version) VALUES($1,$2,$3,$4)',[randomUUID(),p.tenant,input.orderId,updated.version]);
  await c.query('COMMIT');return result;
 }catch(error){if(c)await c.query('ROLLBACK').catch(()=>{});throw safe(error);}finally{c?.release();}
}
export async function listAttachments(db:Pool,p:AttachmentPrincipal,orderId:string):Promise<AttachmentMetadata[]>{
 principal(p);identifier(orderId);try{
 if(!(await db.query('SELECT 1 FROM orders WHERE tenant=$1 AND id=$2',[p.tenant,orderId])).rowCount)throw new Error('NOT_FOUND');
 return (await db.query(`SELECT ${columns} FROM sampling_attachments WHERE tenant=$1 AND order_id=$2 ORDER BY uploaded_at,id`,[p.tenant,orderId])).rows.map(metadata);
 }catch(error){throw safe(error);}
}
export async function readAttachment(db:Pool,p:AttachmentPrincipal,id:string):Promise<{metadata:AttachmentMetadata;data:Buffer}>{
 principal(p);identifier(id);try{const row=(await db.query(`SELECT ${columns},data FROM sampling_attachments WHERE tenant=$1 AND id=$2`,[p.tenant,id])).rows[0];if(!row)throw new Error('NOT_FOUND');return {metadata:metadata(row),data:row.data};}catch(error){throw safe(error);}
}
