import type {CapabilityProvider} from '../platform-contracts/index.ts';import type {Order,NodeState} from '../sampling-contracts/index.ts';
const states:Record<string,NodeState>={waiting:'not_started',doing:'in_progress',held:'blocked',reported:'reported_complete',verified:'accepted',redo:'rework'};
export const ticketCapabilities=['sampling.orders.list','sampling.feedback.submit'] as const;
export function ticketProvider(baseURL:string,key:string,employeeCodes:Record<string,string>):CapabilityProvider {
 if(new Set(Object.values(employeeCodes)).size!==Object.keys(employeeCodes).length)throw new Error('MAPPING_INVALID');
 const actors=Object.fromEntries(Object.entries(employeeCodes).map(([actor,employee])=>[employee,actor]));
 function map(raw:any,tenant:string):Order {
  if(!raw||typeof raw.ticketId!=='string'||!Number.isSafeInteger(raw.revision)||raw.revision<1||!Array.isArray(raw.stages)||!raw.stages.length)throw new Error('PROVIDER_RESPONSE_INVALID');
  const nodes=raw.stages.map((stage:any)=>{
   if(!stage||!Object.hasOwn(states,stage.state)||!Object.hasOwn(actors,stage.ownerEmployeeCode)||!Number.isInteger(stage.completion)||stage.completion<0||stage.completion>100||typeof stage.share!=='number'||!Number.isFinite(stage.share)||stage.share<=0)throw new Error('MAPPING_INVALID');
   return {id:stage.stageCode,name:stage.title,owner:actors[stage.ownerEmployeeCode],status:states[stage.state],percent:stage.completion,due:stage.dueOn,weight:stage.share};
  });
  if(Math.abs(nodes.reduce((s:number,n:any)=>s+n.weight,0)-1)>0.000001)throw new Error('MAPPING_INVALID');
  return {id:raw.ticketId,tenant,version:raw.revision,product:raw.modelName,customer:raw.clientLabel,due:raw.targetDate,nodes,feedback:[],forecast:null,risk:'attention'};
 }
 return {async invoke(capability,input,principal,idempotencyKey){
  if(!ticketCapabilities.includes(capability as any))throw new Error('CAPABILITY_UNAVAILABLE');
  if(!Object.hasOwn(employeeCodes,principal.actor))throw new Error('MAPPING_INVALID');
  const value=input as Record<string,unknown>;const read=capability==='sampling.orders.list';
  const path=read?'/api/prototype-tickets?organization='+encodeURIComponent(principal.tenant):`/api/prototype-tickets/${encodeURIComponent(String(value.id??''))}/progress`;
  if(!read&&(!idempotencyKey||value.mode==='percent'))throw new Error(value.mode==='percent'?'CAPABILITY_UNAVAILABLE':'IDEMPOTENCY_REQUIRED');
  const response=await fetch(baseURL+path,{method:read?'GET':'POST',headers:{'x-integration-key':key,'x-employee':employeeCodes[principal.actor],'x-organization':principal.tenant,'content-type':'application/json','x-request-key':idempotencyKey??''},body:read?undefined:JSON.stringify({stageCode:value.nodeId,expectedRevision:value.expectedVersion,completedUnits:value.completed,targetUnits:value.total,holdReason:value.blocker,finishEstimate:value.expectedFinish,materialEstimate:value.materialEta}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(response.status===409?'VERSION_CONFLICT':'PROVIDER_ERROR');const payload=await response.json() as any;
  if(read){if(!Array.isArray(payload.items))throw new Error('PROVIDER_RESPONSE_INVALID');return payload.items.map((ticket:any)=>map(ticket,principal.tenant));}
  return map(payload.item,principal.tenant);
 }};
}
