import {assertManager,assertIdentity,activeOwner,isManager} from '../../packages/member-authorization/index.ts';
import { randomUUID } from 'node:crypto';
import {validDate} from './project.ts';
import { type Order, type FeedbackInput, type AcceptanceInput } from '../../packages/sampling-contracts/index.ts';
export const orderProgress = (order: Order) => Math.round(order.nodes.reduce((sum, node) => sum + node.percent * node.weight, 0));
export function createOrders(): Order[] {
  const names = ['需求确认','结构设计','电子调试','样机装配','声学测试','品质检验','寄样'];
  const ids = ['requirements','structure','electronics','assembly','acoustics','quality','shipping'];
  const owners = ['chen','wang','li','zhao','zhou','liu','chen'];
  return Array.from({ length: 24 }, (_, i) => ({
    id: `A26-${String(18 + i).padStart(3,'0')}`, tenant: 'demo', version: 1,
    product: ['蓝牙音箱','桌面音响','回音壁','便携音箱'][i % 4],
    customer: ['声境科技','North Audio','悦声电子'][i % 3],
    due: `2026-09-${String(15+i%12).padStart(2,'0')}`, risk: i === 3 ? 'risk' : i === 0 ? 'attention' : 'normal',
    forecast: null,
    nodes: ids.map((id,n) => ({ id, name: names[n], owner: owners[n], due: `2026-09-${String(5+n+(n>2?3:0)).padStart(2,'0')}`, percent: n<3?100:n===3?40:0, status: n<3?'accepted':n===3?'in_progress':'not_started', weight: 1/7 })),
    feedback: [],
  }));
}
function checked(order: Order, nodeId: string, expected: number) {
  if (order.version !== expected) throw new Error('VERSION_CONFLICT');
  const copy = structuredClone(order);
  const node = copy.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error('NOT_FOUND');
  return { copy, node };
}
export function applyFeedback(order: Order, input: FeedbackInput, actor: string): Order {
  const { copy, node } = checked(order, input.nodeId, input.expectedVersion);
  assertIdentity({tenant:order.tenant,actor});
  if (node.owner !== actor) throw new Error('FORBIDDEN');
  if (node.status === 'accepted') throw new Error('NODE_CLOSED');
  if(input.mode!==undefined&&!['quantity','percent'].includes(input.mode)||input.blocker!==undefined&&(typeof input.blocker!=='string'||input.blocker.length>500))throw new Error('VALIDATION_ERROR');
  for(const date of [input.expectedFinish,input.materialEta])if(date!==undefined&&!validDate(date))throw new Error('VALIDATION_ERROR');
  const mode=input.mode??'quantity';const completed=mode==='percent'?input.percent:input.completed;const total=mode==='percent'?100:input.total;
  if(mode==='percent'&&(input.completed!==undefined||input.total!==undefined)||mode==='quantity'&&input.percent!==undefined||!Number.isSafeInteger(completed)||!Number.isSafeInteger(total)||total!<=0||completed!<0||completed!>total!)throw new Error('VALIDATION_ERROR');
  node.percent = Math.round(completed! / total! * 100);
  // A newly reported blocker cannot reuse recovery evidence from an earlier report.
  if(input.blocker?.trim()){delete node.expectedFinish;delete node.materialEta;}
  if(input.expectedFinish!==undefined)node.expectedFinish=input.expectedFinish;
  if(input.materialEta!==undefined)node.materialEta=input.materialEta;
  node.status = input.blocker?.trim() ? 'blocked' : completed === total ? 'reported_complete' : 'in_progress';
  copy.version++;
  if (node.status === 'blocked') { copy.risk = 'attention'; copy.forecast = null; }
  copy.feedback.unshift({ id: randomUUID(), nodeId: node.id, actor, completed: completed!, total: total!, blocker: input.blocker?.trim() ?? '', at: new Date().toISOString(),round:node.reworks?.length??0,mode,...(input.expectedFinish?{expectedFinish:input.expectedFinish}:{}),...(input.materialEta?{materialEta:input.materialEta}:{}) });
  return copy;
}
export function assignOwner(order: Order, nodeId: string, owner: string, expected: number, actor: string): Order {
  assertIdentity({tenant:order.tenant,actor});assertManager(actor);
  if (!activeOwner(owner)) throw new Error('VALIDATION_ERROR');
  const { copy, node } = checked(order, nodeId, expected);
  node.owner = owner; copy.version++;
  return copy;
}
export function acceptNode(order:Order,input:AcceptanceInput,actor:string):Order {
  assertIdentity({tenant:order.tenant,actor});assertManager(actor);
  if(input.note!==undefined&&(typeof input.note!=='string'||input.note.length>500))throw new Error('VALIDATION_ERROR');
  const {copy,node}=checked(order,input.nodeId,input.expectedVersion);
  if(node.status==='accepted')throw new Error('NODE_CLOSED');
  if(node.status!=='reported_complete'||node.percent!==100)throw new Error('NODE_NOT_READY');
  node.status='accepted';
  node.acceptance={actor,at:new Date().toISOString(),note:input.note?.trim()??'',sourceVersion:order.version};
  copy.version++;
  return copy;
}
export function returnNode(order:Order,input:AcceptanceInput,actor:string):Order {
  assertIdentity({tenant:order.tenant,actor});assertManager(actor);
  if(typeof input.note!=='string'||!input.note.trim()||input.note.length>500)throw new Error('VALIDATION_ERROR');
  const {copy,node}=checked(order,input.nodeId,input.expectedVersion);
  if(node.status==='accepted')throw new Error('NODE_CLOSED');
  if(node.status!=='reported_complete')throw new Error('NODE_NOT_READY');
  node.reworks=[...(node.reworks??[]),{actor,at:new Date().toISOString(),note:input.note.trim(),sourceVersion:order.version,previousPercent:node.percent}];
  node.status='rework';node.percent=0;
  delete node.expectedFinish;delete node.materialEta;
  copy.risk=copy.risk==='risk'?'risk':'attention';copy.forecast=null;copy.version++;
  return copy;
}
