import {randomUUID} from 'node:crypto';
import type { CapabilityProvider, Principal,CapabilityDefinition,ScenarioManifest,CapabilityEnvelope } from '../../packages/platform-contracts/index.ts';
import {validateValue} from '../../packages/platform-contracts/validate.ts';
export class CapabilityGateway {
  constructor(private resolve?:(capability:string,principal:Principal)=>Promise<CapabilityProvider>){}
  private bindings = new Map<string,CapabilityProvider>();
  private definitions=new Map<string,CapabilityDefinition>();
  private installations=new Map<string,{id:string;version:string;capabilities:{id:string;version:string;effect:string}[]}>();
  install(tenant:string,manifest:ScenarioManifest,bindings:Record<string,{provider:CapabilityProvider;version:string}>) {
    if(!tenant||!manifest.id||!manifest.version||new Set(manifest.capabilities.map(c=>c.id)).size!==manifest.capabilities.length)throw new Error('VALIDATION_ERROR');
    for(const c of manifest.capabilities){const binding=bindings[c.id];if(!binding)throw new Error('CAPABILITY_UNAVAILABLE');if(binding.version!==c.version)throw new Error('CAPABILITY_VERSION_MISMATCH');}
    for(const c of manifest.capabilities){this.bind(tenant,c.id,bindings[c.id].provider);this.definitions.set(`${tenant}:${c.id}`,structuredClone(c));}
    this.installations.set(`${tenant}:${manifest.id}`,{id:manifest.id,version:manifest.version,capabilities:manifest.capabilities.map(({id,version,effect})=>({id,version,effect}))});
  }
  installed(tenant:string){return [...this.installations.entries()].filter(([key])=>key.startsWith(tenant+':')).map(([,value])=>structuredClone(value));}
  bind(tenant:string, capability:string, provider:CapabilityProvider) { this.bindings.set(`${tenant}:${capability}`,provider); }
  async invoke(capability:string,input:unknown,principal:Principal,key?:string) {
    const provider = this.resolve?await this.resolve(capability,principal):this.bindings.get(`${principal.tenant}:${capability}`);
    if (!provider) throw new Error('CAPABILITY_UNAVAILABLE');
    const definition=this.definitions.get(`${principal.tenant}:${capability}`);
    if(definition){validateValue(definition.input,input);if(definition.effect==='write'&&(!key||key.length>100))throw new Error('IDEMPOTENCY_REQUIRED');}
    const result=await provider.invoke(capability,input,principal,key);
    if(definition?.output)try{validateValue(definition.output,result);}catch{throw new Error('PROVIDER_RESPONSE_INVALID');}
    return result;
  }
  async invokeEnvelope(capability:string,input:unknown,principal:Principal,key?:string):Promise<CapabilityEnvelope>{
    const definition=this.definitions.get(`${principal.tenant}:${capability}`);
    const metadata={requestId:randomUUID(),capabilityId:capability,capabilityVersion:definition?.version??'unversioned',...principal};
    try{return {...metadata,status:'succeeded',result:await this.invoke(capability,input,principal,key)};}
    catch(error){const code=(error as Error).message;
      if(code==='CHANGE_NOT_APPROVED')return {...metadata,status:'awaiting_approval',error:{code}};
      const known=['VALIDATION_ERROR','FORBIDDEN','UNAUTHORIZED','NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_REQUIRED','IDEMPOTENCY_CONFLICT','CAPABILITY_UNAVAILABLE','CAPABILITY_VERSION_MISMATCH','ORDER_EXISTS','NODE_CLOSED','NODE_NOT_READY','CHANGE_ALREADY_DECIDED','CHANGE_ALREADY_APPLIED','ATTACHMENT_TOO_LARGE','ATTACHMENT_LIMIT'];
      if(known.includes(code))return {...metadata,status:'failed',error:{code}};
      return {...metadata,status:definition?.effect==='write'?'unknown':'failed',error:{code:'PROVIDER_RESULT_UNVERIFIED'}};
    }
  }
}
