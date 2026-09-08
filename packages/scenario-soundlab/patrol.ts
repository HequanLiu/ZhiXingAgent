import type {Order} from '../sampling-contracts/index.ts';
import type {PatrolObject} from '../../apps/platform-worker/patrol.ts';
export async function samplingPatrol(tenant:string):Promise<PatrolObject[]> {
 if(!tenant||!process.env.BUSINESS_BRIDGE_KEY)throw new Error('CAPABILITY_UNAVAILABLE');
 const directoryResponse=await fetch('http://127.0.0.1:4310/internal/members',{headers:{authorization:`Bearer ${process.env.BUSINESS_BRIDGE_KEY}`,'x-tenant':tenant},signal:AbortSignal.timeout(3000)});if(!directoryResponse.ok)throw new Error('CAPABILITY_UNAVAILABLE');const members=await directoryResponse.json() as import('../member-authorization/index.ts').Member[];const manager=members.find(m=>m.enabled&&m.role==='manager'&&m.tenant===tenant);if(!manager)throw new Error('CAPABILITY_UNAVAILABLE');
 const response=await fetch('http://127.0.0.1:4311/orders',{headers:{authorization:`Bearer ${process.env.BUSINESS_BRIDGE_KEY}`,'x-tenant':tenant,'x-actor':'service-reader'},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error('CAPABILITY_UNAVAILABLE');const orders=await response.json() as Order[];
 return orders.map(o=>({id:o.id,version:o.version,observedAt:o.schedule?.asOf?o.schedule.asOf+'T00:00:00+08:00':new Date().toISOString(),issues:[
  ...o.nodes.filter(n=>['blocked','rework','reported_complete'].includes(n.status)).map(n=>({key:`${n.id}:${n.status}`,owner:n.owner,summary:`${n.name}：${n.status==='blocked'?'受阻待跟进':n.status==='rework'?'返工待反馈':'报完工待验收'}`})),
  ...(o.schedule?.risk==='risk'&&o.nodes.some(n=>n.status!=='accepted')?[{key:'delivery:risk',owner:manager.actor,summary:`预计完成 ${o.schedule.forecast??'待核实'}，存在交期风险`}]:[])
 ]}));
}

