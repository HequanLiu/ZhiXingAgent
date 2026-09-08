import type {Pool} from 'pg';
import {enqueueAnalysis} from './jobs.ts';
import {modelScopeAllows} from '../../packages/scenario-soundlab/analyze.ts';
export async function workerTenants(db:Pool,env:NodeJS.ProcessEnv=process.env):Promise<string[]>{const tenants=(await db.query('SELECT tenant FROM auth_users WHERE enabled=true UNION SELECT tenant FROM patrol_policy ORDER BY tenant')).rows.map(r=>r.tenant);if(env.SOUNDLAB_DEMO_MODE==='true'&&!tenants.includes('demo'))tenants.push('demo');return tenants.sort();}
export async function pollTenantEvents(db:Pool,tenant:string,key:string,transport:typeof fetch=fetch){
 const name='sample-events:'+tenant;
 // The retired shared cursor belonged exclusively to demo. Adopt it once; a
 // tenant-specific cursor always wins, including a legitimate zero position.
 if(tenant==='demo')await db.query("INSERT INTO worker_cursor(name,value) SELECT $1,value FROM worker_cursor WHERE name='sample-events' ON CONFLICT(name) DO NOTHING",[name]);
 const cursor=String((await db.query('SELECT value FROM worker_cursor WHERE name=$1',[name])).rows[0]?.value??0);
 const res=await transport(`http://127.0.0.1:4311/events?after=${cursor}`,{headers:{authorization:`Bearer ${key}`,'x-tenant':tenant,'x-actor':'service-reader'},signal:AbortSignal.timeout(3000)});
 if(!res.ok)throw new Error('Event provider unavailable');
 const events=await res.json() as {id:string;tenant:string;object_id:string;version:number;sequence:string}[];
 if(!Array.isArray(events)||events.some(event=>event.tenant!==tenant))throw new Error('TENANT_MISMATCH');
 for(const event of events){const client=await db.connect();try{await client.query('BEGIN');
  await client.query('INSERT INTO activity(event_id,tenant,object_id,version,summary) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_id) DO NOTHING',[event.id,tenant,event.object_id,event.version,`${event.object_id} 业务状态已更新至版本 ${event.version}，请查看节点与反馈。`]);
  if(modelScopeAllows(event))await enqueueAnalysis(client,{event_id:event.id,tenant,object_id:event.object_id,version:event.version});
  await client.query('INSERT INTO worker_cursor VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET value=greatest(worker_cursor.value,excluded.value)',[name,event.sequence]);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
}

