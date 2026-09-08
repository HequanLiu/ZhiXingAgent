import {queryChatOrders} from './chat-tools.ts';
import {enqueueChat,listChat} from '../platform-worker/chat.ts';
import {listMembers,saveMember,requireManager,createDirectoryPool} from './members.ts';
import {readNotifications} from '../platform-worker/notifications.ts';
import {installSoundlab,soundlabManifest} from '../../packages/scenario-soundlab/manifest.ts';
import {InstallationRegistry} from './installations.ts';
import {diagnostics} from './diagnostics.ts';
import {installWecom} from './wecom.ts';
import {delegateChange} from '../platform-worker/change-tasks.ts';
import {readRuntimeSettings,saveRuntimeSettings} from '../platform-worker/runtime-settings.ts';
import {verifyChannelSignature,receiveFeedback} from './channel.ts';
import {listExceptions,transitionException,type ExceptionTransition} from './exceptions.ts';
import {authenticate,sessionToken} from './auth.ts';
import {installAuth} from './auth-routes.ts';
import Fastify from 'fastify';
import { Pool } from 'pg';
import { CapabilityGateway } from './gateway.ts';
import { referenceProvider } from '../../packages/adapter-sample-reference/index.ts';
import { registerSoundlab } from '../../packages/scenario-soundlab/routes.ts';
import {retryAnalysis} from '../platform-worker/jobs.ts';
import {savePolicy} from '../platform-worker/patrol.ts';
const app = Fastify({logger:false});
const db = new Pool({connectionString:process.env.PLATFORM_DATABASE_URL ?? 'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform'});
const directoryDb=createDirectoryPool(db);
const bridgeKey = process.env.BUSINESS_BRIDGE_KEY;
if (!bridgeKey) throw new Error('Bridge key required');
// Only this local demo host composes a scenario. Gateway core imports no domain types.
const provider = referenceProvider('http://127.0.0.1:4311',bridgeKey);
const installations=new InstallationRegistry(directoryDb,soundlabManifest,{'sample-reference':{label:'自研打样模块',provider,capabilities:Object.fromEntries(soundlabManifest.capabilities.map(c=>[c.id,c.version]))}},'sample-reference');
const gateway = new CapabilityGateway((capability,p)=>installations.resolve(capability,p));
installSoundlab(gateway,'demo',provider);
const authenticatedPrincipal=installAuth(app,db,{demoMode:process.env.SOUNDLAB_DEMO_MODE==='true',readToken:process.env.SOUNDLAB_READ_TOKEN??'',origin:process.env.SOUNDLAB_APP_ORIGIN??'http://127.0.0.1:5179'});
function principal(headers:Record<string,unknown>){const p=authenticatedPrincipal(headers);if(!gateway.installed(p.tenant).length)installSoundlab(gateway,p.tenant,provider);return p;}
app.setErrorHandler((error,req,reply)=>{
  const code=(error as Error).message;
  const statuses:Record<string,number>={CHAT_BUSY:409,CHAT_DISABLED:503,LAST_MANAGER_REQUIRED:409,ATTACHMENT_TOO_LARGE:413,ATTACHMENT_LIMIT:409,CHANNEL_NOT_CONFIGURED:503,CHANNEL_DELIVERY_UNKNOWN:502,SOURCE_NOT_CLEAR:409,INVALID_TRANSITION:409,IDEMPOTENCY_REQUIRED:400,CAPABILITY_VERSION_MISMATCH:409,CHANGE_NOT_APPROVED:409,CHANGE_ALREADY_APPLIED:409,CHANGE_ALREADY_DECIDED:409,UNAUTHORIZED:401,ORDER_EXISTS:409,ANALYSIS_NOT_FAILED:409,FORBIDDEN:403,NOT_FOUND:404,VALIDATION_ERROR:400,VERSION_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,NODE_CLOSED:409,NODE_NOT_READY:409,CAPABILITY_UNAVAILABLE:503};
  reply.code(statuses[code]??502).send({code:statuses[code]?code:'SERVICE_UNAVAILABLE'});
});
app.get('/health',async()=>{await db.query('SELECT 1'); return {status:'ready'};});
app.get('/health/ready',async(_req,reply)=>{const row=(await db.query("SELECT heartbeat_at>now()-interval '15 seconds' AS online FROM worker_status WHERE name='analysis'")).rows[0];return reply.code(row?.online?200:503).send({status:row?.online?'ready':'unavailable'});});
app.get('/internal/members',async req=>{if(req.headers.authorization!==`Bearer ${bridgeKey}`)throw new Error('FORBIDDEN');return listMembers(directoryDb,String(req.headers['x-tenant']??''));});
app.get('/api/soundlab/people',async req=>Object.fromEntries((await listMembers(db,principal(req.headers).tenant)).map(m=>[m.actor,m.displayName])));
app.get('/api/members',async req=>listMembers(db,principal(req.headers).tenant));
app.post<{Params:{actor:string}}>('/api/members/:actor',async req=>saveMember(db,principal(req.headers),req.params.actor,req.body));
app.get('/internal/chat-orders',async req=>queryChatOrders(directoryDb,bridgeKey,String(req.headers.authorization??'').replace(/^Bearer /,''),async p=>{if(!gateway.installed(p.tenant).length)installSoundlab(gateway,p.tenant,provider);return gateway.invoke('sampling.orders.list',{},p) as Promise<any[]>;}));
app.get('/api/chat',async req=>({enabled:process.env.SOUNDLAB_CHAT_ENABLED==='true',messages:await listChat(db,principal(req.headers))}));
app.post('/api/chat',async req=>{if(process.env.SOUNDLAB_CHAT_ENABLED!=='true')throw Error('CHAT_DISABLED');return enqueueChat(db,principal(req.headers),req.body);});
app.get('/api/runtime',async()=>{
  const worker=(await db.query("SELECT model,enabled,heartbeat_at>now()-interval '10 seconds' AS online FROM worker_status WHERE name='analysis'")).rows[0];
  return {model:worker?.model??'未配置',enabled:!!worker?.enabled,online:!!worker?.online,demo:process.env.SOUNDLAB_DEMO_MODE==='true',
    mode:worker?.online?(worker.enabled?'模型分析已启用':'规则同步 · 模型分析未启用'):'分析 Worker 未连接'};
});
registerSoundlab(app,gateway,principal);
installWecom(app,db,async(p,input,key)=>{if(!gateway.installed(p.tenant).length)installSoundlab(gateway,p.tenant,provider);return gateway.invoke('sampling.feedback.submit',input,p,key);});
app.get('/api/capabilities',async req=>gateway.installed(principal(req.headers).tenant));
app.get('/api/installations',async req=>({...await installations.read(principal(req.headers).tenant),connections:installations.connections()}));
app.post('/api/installations',async req=>installations.save(principal(req.headers),req.body,String(req.headers['idempotency-key']??'')));
app.get('/api/change-tasks',async req=>(await db.query('SELECT id,change_id,status,error_code,attempts,updated_at FROM change_tasks WHERE tenant=$1 ORDER BY updated_at DESC LIMIT 100',[principal(req.headers).tenant])).rows);
app.post<{Body:{changeId:string}}>('/api/change-tasks',async req=>delegateChange(db,principal(req.headers),req.body?.changeId,(cap,input,p,key)=>gateway.invoke(cap,input,p,key)));
app.get('/api/settings/runtime',async req=>readRuntimeSettings(db,principal(req.headers).tenant));
app.post('/api/settings/runtime',async req=>saveRuntimeSettings(db,principal(req.headers),req.body,String(req.headers['idempotency-key']??'')));
app.get('/api/operations',async req=>{
 const p=principal(req.headers);await requireManager(db,p);
 return {health:await diagnostics(db,p.tenant),tasks:(await db.query('SELECT status,count(*)::int AS count,sum(attempts)::int AS attempts FROM analysis_jobs WHERE tenant=$1 GROUP BY status',[p.tenant])).rows,
  retries:(await db.query('SELECT event_id,actor,retried_at FROM analysis_retry_audit WHERE tenant=$1 ORDER BY id DESC LIMIT 20',[p.tenant])).rows,
  channelEvents:(await db.query('SELECT channel,event_id,actor,created_at FROM channel_events WHERE tenant=$1 ORDER BY created_at DESC LIMIT 20',[p.tenant])).rows,
  usage:(await db.query('SELECT event_id,object_id,model,usage,updated_at FROM analysis_jobs WHERE tenant=$1 AND usage IS NOT NULL ORDER BY updated_at DESC LIMIT 20',[p.tenant])).rows,
  cost:null,costNote:'用量仅展示模型返回的计数；历史无回执显示为缺失。输入为未缓存输入，缓存单列；费用尚无计费回执。'};
});
app.post('/api/channel/feedback',async req=>{
 verifyChannelSignature(process.env.SOUNDLAB_CHANNEL_SECRET??'',String(req.headers['x-channel-timestamp']??''),String(req.headers['x-channel-signature']??''),req.body);
 return receiveFeedback(db,req.body,async(p,input,key)=>{if(!gateway.installed(p.tenant).length)installSoundlab(gateway,p.tenant,provider);return gateway.invoke('sampling.feedback.submit',input,p,key);});
});
app.get('/api/exceptions',async req=>listExceptions(db,principal(req.headers)));
app.post<{Params:{id:string};Body:ExceptionTransition}>('/api/exceptions/:id',async req=>transitionException(db,principal(req.headers),req.params.id,req.body,String(req.headers['idempotency-key']??'')));
app.get('/api/patrol',async req=>{
  const {tenant}=principal(req.headers);
  const policy=(await db.query('SELECT * FROM patrol_policy WHERE tenant=$1',[tenant])).rows[0]??{version:0,policy:{enabled:false,intervalMinutes:30,weekdays:[1,2,3,4,5],startHour:9,endHour:18}};
  const runs=(await db.query('SELECT * FROM patrol_runs WHERE tenant=$1 ORDER BY id DESC LIMIT 10',[tenant])).rows;
  const inbox=(await db.query('SELECT * FROM patrol_inbox WHERE tenant=$1 ORDER BY id DESC LIMIT 30',[tenant])).rows;
  return {policy,runs,inbox,...await readNotifications(db,tenant),deliveryEnabled:process.env.WECOM_SEND_ENABLED==='true'};
});
app.post<{Body:{policy:unknown;expectedVersion:number}}>('/api/patrol',async req=>savePolicy(db,principal(req.headers),req.body?.policy,req.body?.expectedVersion));
app.get('/api/activity',async req=> (await db.query('SELECT * FROM activity WHERE tenant=$1 ORDER BY sequence DESC LIMIT 12',[principal(req.headers).tenant])).rows);
app.get('/api/analysis',async req=>(await db.query(`SELECT event_id,object_id,version,status,attempts,summary,observed_version,model,error_code,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
  FROM analysis_jobs WHERE tenant=$1 ORDER BY updated_at DESC LIMIT 12`,[principal(req.headers).tenant])).rows);
app.post<{Params:{id:string};Body:{expectedUpdatedAt:string}}>('/api/analysis/:id/retry',async req=>retryAnalysis(db,principal(req.headers),{eventId:req.params.id,expectedUpdatedAt:req.body?.expectedUpdatedAt}));
app.get<{Params:{id:string}}>('/api/analysis/:id/evidence',async req=>{
 const row=(await db.query('SELECT object_id,receipts FROM analysis_jobs WHERE event_id=$1 AND tenant=$2',[req.params.id,principal(req.headers).tenant])).rows[0];if(!row)throw new Error('NOT_FOUND');
 return (row.receipts??[]).flatMap((receipt:any)=>(receipt.objects??[]).filter((o:any)=>o.id===row.object_id).map((object:any)=>({at:receipt.at,capability:receipt.capability,...object})));
});
app.get('/api/events',async(req,reply)=>{
  const tenant=principal(req.headers).tenant;
  reply.hijack();
  reply.raw.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache',connection:'keep-alive'});
  let previous='';
  const tick=async()=>{
    if(process.env.SOUNDLAB_DEMO_MODE!=='true'){try{await authenticate(db,sessionToken(req.headers.cookie));}catch{reply.raw.end();return;}}
    try { const {rows}=await db.query(`SELECT (SELECT COALESCE(max(sequence),0)::text FROM activity WHERE tenant=$1) || ':' ||
      (SELECT COALESCE(max(updated_at)::text,'') FROM analysis_jobs WHERE tenant=$1) AS revision`,[tenant]); const revision=String(rows[0].revision);
      if(revision!==previous){reply.raw.write(`data: ${JSON.stringify({revision})}\n\n`);previous=revision;} else reply.raw.write(': heartbeat\n\n');
    } catch {reply.raw.write('event: unavailable\ndata: {}\n\n');}
  };
  await tick(); const timer=setInterval(()=>void tick(),2000);
  reply.raw.on('close',()=>clearInterval(timer));
});
await app.listen({host:'127.0.0.1',port:4310});
console.log('Agent platform ready at http://127.0.0.1:4310');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{await app.close();await Promise.all([db.end(),directoryDb.end()]);process.exit(0);});
