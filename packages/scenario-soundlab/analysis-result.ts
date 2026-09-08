import {people} from '../sampling-contracts/index.ts';
import type {Receipt} from '../runtime-deepseek/index.mjs';

interface NodeEvidence {id:string;name:string;status:string;owner:string;percent:number;plannedDue:string}
interface OrderEvidence {id:string;version:number;product:string;due:string;risk:string;overallPercent:number;nodes:NodeEvidence[]}
const labels:Record<string,string>={not_started:'待开始',in_progress:'进行中',blocked:'受阻',reported_complete:'待验收',accepted:'已验收',rework:'返工待反馈'};
const riskLabels:Record<string,string>={normal:'正常',attention:'需关注',risk:'交期风险'};
const policies:Record<string,{status:string;text:string}>={
  confirm_rework:{status:'rework',text:'核实返工范围、处理安排与重新报完工时间；当前轮次进度重新累计。'},
  confirm_blocker:{status:'blocked',text:'核实阻塞原因、解除条件及预计恢复时间。'},
  confirm_readiness:{status:'not_started',text:'核实启动条件、资源准备和计划完成安排。'},
  confirm_acceptance:{status:'reported_complete',text:'核实验收条件与验收安排；报告完成不等于已验收。'},
};
function exactKeys(value:unknown,keys:string[]):value is Record<string,unknown> {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
}
function invalid():never {throw new Error('ANALYSIS_SCHEMA_INVALID');}
export function renderSoundlabAnalysis(text:string,receipts:Receipt[],event:{object_id:string;version:number}) {
  let value:unknown;
  try {value=JSON.parse(text.replace(/^```json\s*/i,'').replace(/\s*```$/,''));}catch{invalid();}
  if(!exactKeys(value,['orderId','version','checks'])||value.orderId!==event.object_id||!Number.isSafeInteger(value.version)
    ||Number(value.version)<event.version||!Array.isArray(value.checks)||value.checks.length>7)invalid();
  const raw=receipts.filter(r=>r.capability==='sampling.orders.list').flatMap(r=>r.objects)
    .find(o=>o.id===value.orderId&&o.version===value.version)?.evidence;
  if(!raw||typeof raw!=='object')throw new Error('EVIDENCE_MISSING');
  const evidence=raw as OrderEvidence;
  if(evidence.id!==value.orderId||evidence.version!==value.version||!Array.isArray(evidence.nodes)
    ||!Number.isInteger(evidence.overallPercent)||evidence.overallPercent<0||evidence.overallPercent>100)throw new Error('EVIDENCE_MISSING');
  const seen=new Set<string>();
  const checks=value.checks.map((check:unknown)=>{
    if(!exactKeys(check,['nodeId','kind'])||typeof check.nodeId!=='string'||typeof check.kind!=='string'
      ||!Object.hasOwn(policies,check.kind))invalid();
    const node=evidence.nodes.find(n=>n.id===check.nodeId);const policy=policies[check.kind];
    if(!node||node.status!==policy.status||seen.has(node.id))invalid();seen.add(node.id);
    return `• ${node.name} · ${people[node.owner]??node.owner}：${policy.text}`;
  });
  const facts=evidence.nodes.map(n=>`• ${n.name}：${labels[n.status]??n.status} ${n.percent}% · 负责人 ${people[n.owner]??n.owner} · 计划完成 ${n.plannedDue}`);
  const summary=[`业务事实 · ${evidence.id} v${evidence.version}`,`${evidence.product} · 整单进度：${evidence.overallPercent}% · 目标寄样：${evidence.due}`,
    `业务风险标记：${riskLabels[evidence.risk]??evidence.risk}`,...facts,'',
    '助理建议 · 待负责人核实',...(checks.length?checks:['本次未选择额外核实项；不代表业务已无风险。']),
    '', '尚无依赖交期评估；节点日期为计划完成日。以上未执行通知、验收或业务变更。'].join('\n');
  return {summary,observedVersion:evidence.version};
}
