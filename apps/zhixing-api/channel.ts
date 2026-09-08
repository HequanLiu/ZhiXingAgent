import {resolveMember} from './members.ts';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';import type {Pool} from 'pg';import type {Principal} from '../../packages/platform-contracts/index.ts';
export function verifyChannelSignature(secret:string,timestamp:string,signature:string,body:unknown,now=Date.now()) {
 if(!secret||secret.length<32)throw new Error('CHANNEL_NOT_CONFIGURED');
 if(!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300000||!/^[a-f0-9]{64}$/.test(signature))throw new Error('FORBIDDEN');
 const expected=createHmac('sha256',secret).update(timestamp+'.'+JSON.stringify(body)).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new Error('FORBIDDEN');
}
export async function migrateChannel(db:Pool){await db.query(`CREATE TABLE IF NOT EXISTS channel_identities(channel text NOT NULL,sender_id text NOT NULL,tenant text NOT NULL,actor text NOT NULL,PRIMARY KEY(channel,sender_id));
 CREATE TABLE IF NOT EXISTS channel_events(channel text NOT NULL,event_id text NOT NULL,fingerprint text NOT NULL,tenant text NOT NULL,actor text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(channel,event_id));`);}
export async function receiveFeedback(db:Pool,body:unknown,invoke:(principal:Principal,input:Record<string,unknown>,key:string)=>Promise<unknown>) {
 const b=body as Record<string,unknown>;
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['channel','eventId','senderId','orderId','nodeId','expectedVersion','completed','total','mode','percent','blocker','expectedFinish','materialEta'].includes(k))||!['channel','eventId','senderId','orderId','nodeId'].every(k=>typeof b[k]==='string'&&(b[k] as string).length>0&&(b[k] as string).length<=100))throw new Error('VALIDATION_ERROR');
 const fingerprint=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const client=await db.connect();
 try {
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`channel:${b.channel}:${b.eventId}`]);
  const identity=(await client.query('SELECT tenant,actor FROM channel_identities WHERE channel=$1 AND sender_id=$2',[b.channel,b.senderId])).rows[0];if(!identity)throw new Error('FORBIDDEN');await resolveMember(client,identity);
  const existing=(await client.query('SELECT * FROM channel_events WHERE channel=$1 AND event_id=$2',[b.channel,b.eventId])).rows[0];
  if(existing){if(existing.fingerprint!==fingerprint||existing.tenant!==identity.tenant||existing.actor!==identity.actor)throw new Error('IDEMPOTENCY_CONFLICT');await client.query('COMMIT');return existing.result;}
  const{channel,eventId,senderId,orderId,...fields}=b;
  const key='channel-'+createHash('sha256').update(JSON.stringify([channel,eventId])).digest('hex');
  // A retry after a lost HTTP response reuses the business system's exact idempotency key.
  const result=await invoke(identity,{...fields,id:orderId},key);
  await client.query('INSERT INTO channel_events(channel,event_id,fingerprint,tenant,actor,payload,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[channel,eventId,fingerprint,identity.tenant,identity.actor,JSON.stringify(body),JSON.stringify(result)]);
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');const code=(error as Error).message;if(['FORBIDDEN','VALIDATION_ERROR','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT','NODE_CLOSED','NOT_FOUND'].includes(code))throw error;throw new Error('CHANNEL_DELIVERY_UNKNOWN');}finally{client.release();}
}
