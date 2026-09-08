import {requireManager,managerActor} from '../platform-api/members.ts';
import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {modelConfiguration} from '../../packages/runtime-deepseek/index.mjs';
import {workerTiming} from './timing.mjs';

export interface RuntimeSettings {
  route:'minimax'|'deepseek';enabled:boolean;modelId?:string;baseURL?:string;
  initializeTimeoutMs:number;requestTimeoutMs:number;runTimeoutMs:number;analysisIntervalMs:number;
}
export interface RuntimeSettingsSnapshot {version:number;settings:RuntimeSettings|null}
const fields=['route','enabled','modelId','baseURL','initializeTimeoutMs','requestTimeoutMs','runTimeoutMs','analysisIntervalMs'];
// Browser-managed configuration must never redirect server-held provider credentials.
// Operator environment overrides remain available only before persistent settings are saved.
const approvedEndpoints={minimax:'https://api.minimax.cn/v1',deepseek:'https://api.deepseek.com'};
function settingsObject(input:unknown):RuntimeSettings {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))throw new Error('VALIDATION_ERROR');
  const value=input as Record<string,unknown>;
  if(!['minimax','deepseek'].includes(value.route as string)||typeof value.enabled!=='boolean')throw new Error('VALIDATION_ERROR');
  for(const name of ['initializeTimeoutMs','requestTimeoutMs','runTimeoutMs','analysisIntervalMs'])if(!Number.isSafeInteger(value[name]))throw new Error('VALIDATION_ERROR');
  for(const name of ['modelId','baseURL'])if(Object.hasOwn(value,name)&&typeof value[name]!=='string')throw new Error('VALIDATION_ERROR');
  if(Object.hasOwn(value,'baseURL')&&value.baseURL!==approvedEndpoints[value.route as keyof typeof approvedEndpoints])throw new Error('VALIDATION_ERROR');
  const settings:RuntimeSettings={route:value.route as RuntimeSettings['route'],enabled:value.enabled,
    ...(Object.hasOwn(value,'modelId')?{modelId:value.modelId as string}:{}),...(Object.hasOwn(value,'baseURL')?{baseURL:value.baseURL as string}:{}),
    initializeTimeoutMs:value.initializeTimeoutMs as number,requestTimeoutMs:value.requestTimeoutMs as number,
    runTimeoutMs:value.runTimeoutMs as number,analysisIntervalMs:value.analysisIntervalMs as number};
  try {const env=settingsEnvironment(settings);modelConfiguration(env);workerTiming(env);}catch{throw new Error('VALIDATION_ERROR');}
  return settings;
}
function settingsEnvironment(settings:RuntimeSettings):NodeJS.ProcessEnv {
  return {SOUNDLAB_MODEL_ROUTE:settings.route,SOUNDLAB_MODEL_ANALYSIS:String(settings.enabled),
    SOUNDLAB_MODEL_INITIALIZE_TIMEOUT_MS:String(settings.initializeTimeoutMs),SOUNDLAB_MODEL_REQUEST_TIMEOUT_MS:String(settings.requestTimeoutMs),
    SOUNDLAB_MODEL_RUN_TIMEOUT_MS:String(settings.runTimeoutMs),SOUNDLAB_ANALYSIS_INTERVAL_MS:String(settings.analysisIntervalMs),
    ...(settings.modelId!==undefined?{SOUNDLAB_MODEL_ID:settings.modelId}:{}),...(settings.baseURL!==undefined?{SOUNDLAB_MODEL_BASE_URL:settings.baseURL}:{})};
}
export function applyRuntimeSettings(baseEnv:NodeJS.ProcessEnv,settings:unknown):NodeJS.ProcessEnv {
  const env={...baseEnv};
  if(settings===null)return env;
  const validated=settingsObject(settings);
  delete env.SOUNDLAB_MODEL_ID;delete env.SOUNDLAB_MODEL_BASE_URL;
  return {...env,...settingsEnvironment(validated)};
}
function tenantAllowed(tenant:string){if(tenant!=='demo')throw new Error('FORBIDDEN');}
export async function migrateRuntimeSettings(db:Pool):Promise<void> {
  try {await db.query(`CREATE TABLE IF NOT EXISTS runtime_settings(
    tenant text PRIMARY KEY CHECK(tenant='demo'),version integer NOT NULL DEFAULT 0,settings jsonb,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
    INSERT INTO runtime_settings(tenant) VALUES('demo') ON CONFLICT(tenant) DO NOTHING;
    CREATE TABLE IF NOT EXISTS runtime_settings_audit(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,actor text NOT NULL,
      request_key text NOT NULL,request_hash text NOT NULL,version integer NOT NULL,
      previous_settings jsonb,new_settings jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(tenant,actor,request_key));
    CREATE OR REPLACE FUNCTION reject_runtime_settings_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'runtime settings audit is immutable'; END; $$;
    DROP TRIGGER IF EXISTS runtime_settings_audit_immutable ON runtime_settings_audit;
    CREATE TRIGGER runtime_settings_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON runtime_settings_audit
      FOR EACH STATEMENT EXECUTE FUNCTION reject_runtime_settings_audit_change();`);
  }catch{throw new Error('SERVICE_UNAVAILABLE');}
}
export async function readRuntimeSettings(db:Pool,tenant='demo'):Promise<RuntimeSettingsSnapshot> {
  tenantAllowed(tenant);
  try {
    const row=(await db.query('SELECT version,settings FROM runtime_settings WHERE tenant=$1',[tenant])).rows[0];
    if(!row)return {version:0,settings:null};
    return {version:row.version,settings:row.settings===null?null:settingsObject(row.settings)};
  }catch{throw new Error('SERVICE_UNAVAILABLE');}
}
export async function saveRuntimeSettings(db:Pool,principal:{tenant:string;actor:string},input:unknown,key:string):Promise<RuntimeSettingsSnapshot> {
  tenantAllowed(principal.tenant);await requireManager(db,principal);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(name=>!['expectedVersion','settings'].includes(name)))throw new Error('VALIDATION_ERROR');
  const command=input as {expectedVersion:unknown;settings:unknown};
  if(!Number.isSafeInteger(command.expectedVersion)||(command.expectedVersion as number)<0||typeof key!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(key))throw new Error('VALIDATION_ERROR');
  const settings=settingsObject(command.settings);
  const hash=createHash('sha256').update(JSON.stringify({expectedVersion:command.expectedVersion,settings})).digest('hex');
  let client:PoolClient|undefined;
  try {
    client=await db.connect();await client.query('BEGIN');
    const current=(await client.query('SELECT version,settings FROM runtime_settings WHERE tenant=$1 FOR UPDATE',[principal.tenant])).rows[0];
    if(!current)throw new Error('SERVICE_UNAVAILABLE');
    const previous=(await client.query('SELECT request_hash,version,new_settings FROM runtime_settings_audit WHERE tenant=$1 AND actor=$2 AND request_key=$3',[principal.tenant,principal.actor,key])).rows[0];
    if(previous){
      if(previous.request_hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');
      const replay={version:previous.version,settings:settingsObject(previous.new_settings)};
      await client.query('COMMIT');return replay;
    }
    if(current.version!==command.expectedVersion)throw new Error('VERSION_CONFLICT');
    const version=current.version+1;
    const oldSettings=current.settings===null?null:settingsObject(current.settings);
    await client.query(`INSERT INTO runtime_settings_audit(tenant,actor,request_key,request_hash,version,previous_settings,new_settings) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [principal.tenant,principal.actor,key,hash,version,oldSettings===null?null:JSON.stringify(oldSettings),JSON.stringify(settings)]);
    await client.query('UPDATE runtime_settings SET version=$2,settings=$3,updated_at=clock_timestamp() WHERE tenant=$1',[principal.tenant,version,JSON.stringify(settings)]);
    await client.query('COMMIT');return {version,settings};
  }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    const code=error instanceof Error?error.message:'';
    throw new Error(['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'].includes(code)?code:'SERVICE_UNAVAILABLE');
  }finally{client?.release();}
}
