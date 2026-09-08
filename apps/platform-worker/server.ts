import {chatToolToken} from '../platform-api/chat-tools.ts';
import {runChat} from './chat.ts';
import {runChangeTask} from './change-tasks.ts';
import {CapabilityGateway} from '../platform-api/gateway.ts';
import {InstallationRegistry} from '../platform-api/installations.ts';
import {soundlabManifest,installSoundlab} from '../../packages/scenario-soundlab/manifest.ts';
import {referenceProvider} from '../../packages/adapter-sample-reference/index.ts';
import { Pool } from 'pg';
import {readRuntimeSettings,applyRuntimeSettings} from './runtime-settings.ts';
import {runPatrol} from './patrol.ts';
import {workerTenants,pollTenantEvents} from './event-poll.ts';
import {recoverNotifications,dispatchNotification} from './notifications.ts';
import {readWecomConfig} from '../platform-api/wecom.ts';
import {createWecomSender} from '../platform-api/wecom-send.ts';
import {samplingPatrol} from '../../packages/scenario-soundlab/patrol.ts';
import {claimAnalysis,completeAnalysis,failAnalysis,recoverAnalysis} from './jobs.ts';
import {modelConfiguration,runModel} from '../../packages/runtime-deepseek/index.mjs';
import {analyzeSampling} from '../../packages/scenario-soundlab/analyze.ts';
import {reconcileExceptions} from '../platform-api/exceptions.ts';
import {workerTiming} from './timing.mjs';
import {safeAnalysisError} from '../../packages/runtime-deepseek/result.mjs';
const db=new Pool({connectionString:process.env.PLATFORM_DATABASE_URL??'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform'});
if(!process.env.BUSINESS_BRIDGE_KEY)throw new Error('Bridge key required');
const actionProvider=referenceProvider('http://127.0.0.1:4311',process.env.BUSINESS_BRIDGE_KEY);
const actionRegistry=new InstallationRegistry(db,soundlabManifest,{'sample-reference':{label:'自研打样模块',provider:actionProvider,capabilities:Object.fromEntries(soundlabManifest.capabilities.map(c=>[c.id,c.version]))}},'sample-reference');
const actionGateway=new CapabilityGateway((cap,p)=>actionRegistry.resolve(cap,p));
let stopped=false;
const abort=new AbortController();
const baseEnvironment={...process.env};
let configuration=modelConfiguration();
let timing=workerTiming();
const lock=await db.connect();
if(!(await lock.query("SELECT pg_try_advisory_lock(71004310) AS acquired")).rows[0].acquired) {
  lock.release();await db.end();throw new Error('WORKER_ALREADY_RUNNING');
}
// Loss of the lock connection must stop model dispatch, otherwise a replacement could overlap.
lock.on('error',()=>{stopped=true;abort.abort();});
await recoverAnalysis(db);
await recoverNotifications(db);
await db.query("UPDATE chat_messages SET status='failed',error_code='WORKER_RESTARTED',updated_at=now() WHERE status='running'");
const wecomConfig=process.env.WECOM_SEND_ENABLED==='true'?readWecomConfig():null;
const wecomSender=wecomConfig?.enabled?createWecomSender(wecomConfig):null;
async function heartbeat() {
  await db.query(`INSERT INTO worker_status VALUES('analysis',$1,$2,now()) ON CONFLICT(name) DO UPDATE SET model=excluded.model,enabled=excluded.enabled,heartbeat_at=now()`,[configuration.model,configuration.enabled]);
}
async function analysisLoop() {
  while(!stopped) {
    try {
      const snapshot=await readRuntimeSettings(db,'demo');const next=applyRuntimeSettings(baseEnvironment,snapshot.settings);
      for(const key of ['SOUNDLAB_MODEL_ROUTE','SOUNDLAB_MODEL_ANALYSIS','SOUNDLAB_MODEL_ID','SOUNDLAB_MODEL_BASE_URL','SOUNDLAB_MODEL_INITIALIZE_TIMEOUT_MS','SOUNDLAB_MODEL_REQUEST_TIMEOUT_MS','SOUNDLAB_MODEL_RUN_TIMEOUT_MS','SOUNDLAB_ANALYSIS_INTERVAL_MS']){if(next[key]===undefined)delete process.env[key];else process.env[key]=next[key];}
      configuration=modelConfiguration();timing=workerTiming();
      if(configuration.enabled) {
        const job=await claimAnalysis(db);
        if(job) {
          try {
            const result=await analyzeSampling(job,abort.signal);
            await completeAnalysis(db,job,result);
          } catch(error) {
            // Do not expose SDK errors or request details. Failed analyses never replace business facts.
            await failAnalysis(db,job,stopped?'WORKER_STOPPED':safeAnalysisError(error));
          }
        }
      }
    } catch {console.error('Analysis queue unavailable; retrying');}
    if(!stopped)await new Promise(r=>setTimeout(r,timing.analysisIntervalMs));
  }
}
console.log(`Platform worker running; model analysis ${configuration.enabled?'enabled':'disabled'}; queue interval ${timing.analysisIntervalMs}ms`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopped=true;abort.abort();});
try {
  await Promise.all([(async()=>{while(!stopped){try{if(process.env.SOUNDLAB_CHAT_ENABLED==='true')await runChat(db,(prompt,job)=>runModel({prompt,chat:true,signal:abort.signal,pluginURL:new URL('../../packages/scenario-soundlab/chat-tools.mjs',import.meta.url).href,chatToken:chatToolToken(process.env.BUSINESS_BRIDGE_KEY!,job.id)}));}catch{console.error('Chat queue unavailable');}if(!stopped)await new Promise(r=>setTimeout(r,1000));}})(),analysisLoop(),(async()=>{
    while(!stopped){try{await heartbeat();for(const tenant of await workerTenants(db)){try{await pollTenantEvents(db,tenant,process.env.BUSINESS_BRIDGE_KEY!);await runPatrol(db,tenant,()=>samplingPatrol(tenant),facts=>reconcileExceptions(db,tenant,facts));}catch{console.error('Tenant provider unavailable; continuing other tenants');}}
      if(!stopped)await runChangeTask(db,async(cap,input,p,key)=>{if(!actionGateway.installed(p.tenant).length)installSoundlab(actionGateway,p.tenant,actionProvider);return actionGateway.invoke(cap,input,p,key);});
      if(wecomSender&&!stopped)await dispatchNotification(db,wecomSender,true);}catch{console.error('Worker will retry unavailable provider/database');}if(!stopped)await new Promise(r=>setTimeout(r,timing.eventPollMs));}
  })()]);
} finally {await lock.query('SELECT pg_advisory_unlock(71004310)').catch(()=>{});lock.release();await db.end();}


