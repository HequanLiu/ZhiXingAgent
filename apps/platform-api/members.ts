import {Pool} from 'pg';
import type {Member} from '../../packages/member-authorization/index.ts';
import type {Principal} from '../../packages/platform-contracts/index.ts';
export type {Member};
// Directory reads must not share connections held by channel callbacks awaiting a business invocation.
export function createDirectoryPool(source:Pool){return new Pool({...source.options,max:4});}
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,60}$/.test(v)&&v!=='service-reader';
const columns='tenant,actor,display_name AS "displayName",role,enabled,version';
export async function listMembers(db:Pick<Pool,'query'>,tenant:string):Promise<Member[]>{if(!validId(tenant))throw new Error('FORBIDDEN');return (await db.query(`SELECT ${columns} FROM tenant_members WHERE tenant=$1 ORDER BY actor`,[tenant])).rows;}
export async function resolveMember(db:Pick<Pool,'query'>,p:Principal):Promise<Principal & Member>{if(!p||!validId(p.tenant)||!validId(p.actor))throw new Error('FORBIDDEN');const m=(await db.query(`SELECT ${columns} FROM tenant_members WHERE tenant=$1 AND actor=$2 AND enabled=true`,[p.tenant,p.actor])).rows[0];if(!m)throw new Error('FORBIDDEN');return m;}
export async function requireManager(db:Pick<Pool,'query'>,p:Principal){const m=await resolveMember(db,p);if(m.role!=='manager')throw new Error('FORBIDDEN');return m;}
export async function managerActor(db:Pick<Pool,'query'>,tenant:string){const member=(await listMembers(db,tenant)).find(m=>m.enabled&&m.role==='manager');if(!member)throw new Error('FORBIDDEN');return member.actor;}
export async function saveMember(db:Pool,p:Principal,actor:string,raw:unknown,bootstrap=false):Promise<Member>{
 const input=raw as {displayName:string;role:Member['role'];enabled:boolean;expectedVersion:number};
 if(!validId(actor)||!validId(p.tenant)||!input||Object.keys(input).some(k=>!['displayName','role','enabled','expectedVersion'].includes(k))||typeof input.displayName!=='string'||!input.displayName.trim()||input.displayName.length>100||!['manager','member'].includes(input.role)||typeof input.enabled!=='boolean'||!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)throw new Error('VALIDATION_ERROR');
 const tx=await db.connect();try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['members:'+p.tenant]);
 const existing=await listMembers(tx,p.tenant);
 if(bootstrap){if(existing.length!==0||input.role!=='manager'||!input.enabled||p.actor!==actor)throw new Error('FORBIDDEN');}else await requireManager(tx,p);
 const old=existing.find(m=>m.actor===actor);if((old?.version??0)!==input.expectedVersion)throw new Error('VERSION_CONFLICT');
 const updated:Member={tenant:p.tenant,actor,displayName:input.displayName.trim(),role:input.role,enabled:input.enabled,version:(old?.version??0)+1};
 if(![...existing.filter(m=>m.actor!==actor),updated].some(m=>m.enabled&&m.role==='manager'))throw new Error('LAST_MANAGER_REQUIRED');
 await tx.query('INSERT INTO tenant_members(tenant,actor,display_name,role,enabled,version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant,actor) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,enabled=EXCLUDED.enabled,version=EXCLUDED.version',[p.tenant,actor,updated.displayName,updated.role,updated.enabled,updated.version]);
 await tx.query('INSERT INTO member_audit(tenant,actor,target_actor,before_data,after_data) VALUES($1,$2,$3,$4,$5)',[p.tenant,p.actor,actor,old??null,updated]);await tx.query('COMMIT');return updated;
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
export async function seedDemoMembers(db:Pool){for(const[actor,displayName]of Object.entries({chen:'陈静',wang:'王磊',li:'李工',zhao:'赵强',zhou:'周敏',liu:'刘芳'}))await db.query('INSERT INTO tenant_members(tenant,actor,display_name,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',['demo',actor,displayName,actor==='chen'?'manager':'member']);}
