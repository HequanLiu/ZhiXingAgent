export interface Principal { tenant: string; actor: string; role?: 'manager'|'member'; displayName?:string }
export interface CapabilityProvider { invoke(capability: string, input: unknown, principal: Principal, key?: string): Promise<unknown> }
export interface ValueSchema {type:'object'|'array'|'string'|'integer'|'number'|'boolean';properties?:Record<string,ValueSchema>;required?:string[];additionalProperties?:boolean;items?:ValueSchema;maxLength?:number;minimum?:number;enum?:unknown[]}
export interface CapabilityDefinition {id:string;version:string;effect:'read'|'write';input:ValueSchema;output?:ValueSchema}
export interface ScenarioManifest {id:string;version:string;capabilities:CapabilityDefinition[]}
export interface CapabilityEnvelope {requestId:string;capabilityId:string;capabilityVersion:string;tenant:string;actor:string;status:'succeeded'|'awaiting_approval'|'failed'|'unknown';result?:unknown;error?:{code:string}}
