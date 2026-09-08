import {requireManager} from './members.ts';
import {createHash} from 'node:crypto';import type {Pool} from 'pg';
import type {ScenarioManifest,CapabilityProvider,Principal} from '../../packages/platform-contracts/index.ts';
export interface Connection {label:string;capabilities:Record<string,string>;provider:CapabilityProvider}
interface Configuration {enabled:boolean;bindings:Record<string,string>}
export async function migrateInstallations(db:Pick<Pool,'query'>){await db.query(`CREATE TABLE IF NOT EXISTS scenario_installations(tenant text NOT NULL,scenario text NOT NULL,manifest_version text NOT NULL,version integer NOT NULL,config jsonb NOT NULL,PRIMARY KEY(tenant,scenario));
 CREATE TABLE IF NOT EXISTS installation_audit(id bigserial PRIMARY KEY,tenant text NOT NULL,scenario text NOT NULL,actor text NOT NULL,previous_config jsonb,new_config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS installation_mutations(tenant text NOT NULL,key text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(tenant,key));`);}
export class InstallationRegistry {
 constructor(private db:Pool,private manifest:ScenarioManifest,private catalog:Record<string,Connection>,private defaultConnection:string){}
 connections(){return Object.entries(this.catalog).map(([id,c])=>({id,label:c.label,capabilities:c.capabilities}));}
 private validate(config:Configuration){
  if(!config||typeof config.enabled!=='boolean'||!config.bindings||typeof config.bindings!=='object'||Array.isArray(config.bindings))throw new Error('VALIDATION_ERROR');
  if(Object.keys(config.bindings).length!==this.manifest.capabilities.length)throw new Error('CAPABILITY_UNAVAILABLE');
  for(const cap of this.manifest.capabilities){const id=config.bindings[cap.id];if(typeof id!=='string'||!Object.hasOwn(this.catalog,id))throw new Error('CAPABILITY_UNAVAILABLE');if(this.catalog[id].capabilities[cap.id]!==cap.version)throw new Error('CAPABILITY_VERSION_MISMATCH');}
 }
 async read(tenant:string){
  const row=(await this.db.query('SELECT * FROM scenario_installations WHERE tenant=$1 AND scenario=$2',[tenant,this.manifest.id])).rows[0];
  if(row&&row.manifest_version!==this.manifest.version)throw new Error('CAPABILITY_VERSION_MISMATCH');
  const config:Configuration=row?.config??{enabled:true,bindings:Object.fromEntries(this.manifest.capabilities.map(c=>[c.id,this.defaultConnection]))};this.validate(config);
  return {scenario:this.manifest.id,manifestVersion:this.manifest.version,version:row?.version??0,...config};
 }
 async resolve(capability:string,p:Principal){const config=await this.read(p.tenant);if(!config.enabled||!Object.hasOwn(config.bindings,capability))throw new Error('CAPABILITY_UNAVAILABLE');return this.catalog[config.bindings[capability]].provider;}
 async save(p:Principal,raw:unknown,key:string){
  await requireManager(this.db,p);
  const input=raw as Configuration&{expectedVersion:number};
  if(!input||Object.keys(input).some(k=>!['expectedVersion','enabled','bindings'].includes(k))||!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)throw new Error('VALIDATION_ERROR');
  this.validate(input);if(!key||key.length>100)throw new Error('IDEMPOTENCY_REQUIRED');
  const config={enabled:input.enabled,bindings:Object.fromEntries(Object.entries(input.bindings).sort(([a],[b])=>a.localeCompare(b)))};
  const fingerprint=createHash('sha256').update(JSON.stringify([p.actor,this.manifest.id,input.expectedVersion,config])).digest('hex');const tx=await this.db.connect();
  try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`installation:${p.tenant}`]);
   const replay=(await tx.query('SELECT * FROM installation_mutations WHERE tenant=$1 AND key=$2',[p.tenant,key])).rows[0];if(replay){if(replay.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_CONFLICT');await tx.query('COMMIT');return replay.result;}
   const previous=(await tx.query('SELECT * FROM scenario_installations WHERE tenant=$1 AND scenario=$2 FOR UPDATE',[p.tenant,this.manifest.id])).rows[0];if((previous?.version??0)!==input.expectedVersion)throw new Error('VERSION_CONFLICT');
   const result={scenario:this.manifest.id,manifestVersion:this.manifest.version,version:input.expectedVersion+1,...config};
   await tx.query('INSERT INTO scenario_installations VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,scenario) DO UPDATE SET manifest_version=excluded.manifest_version,version=excluded.version,config=excluded.config',[p.tenant,this.manifest.id,this.manifest.version,result.version,JSON.stringify(config)]);
   await tx.query('INSERT INTO installation_audit(tenant,scenario,actor,previous_config,new_config) VALUES($1,$2,$3,$4,$5)',[p.tenant,this.manifest.id,p.actor,previous?.config??null,JSON.stringify(config)]);
   await tx.query('INSERT INTO installation_mutations VALUES($1,$2,$3,$4)',[p.tenant,key,fingerprint,JSON.stringify(result)]);await tx.query('COMMIT');return result;
  }catch(error){await tx.query('ROLLBACK');if(['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'].includes((error as Error).message))throw error;throw new Error('SERVICE_UNAVAILABLE');}finally{tx.release();}
 }
}
