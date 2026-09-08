import {useMembers} from './Members';
import {useState} from 'react';
import {Alert,Input,Modal,Radio} from 'antd';
import {type Order,type SampleNode} from '../../../packages/sampling-contracts/index.ts';
export interface AcceptanceTarget {orderId:string;version:number;node:SampleNode}
export function NodeAcceptance({target,pending,onCancel,onSubmit}:{target:AcceptanceTarget;pending:boolean;onCancel:()=>void;onSubmit:(note:string,decision:'accept'|'return')=>void}) {
 const {people,ownerOptions,isManager}=useMembers();
  const [note,setNote]=useState('');
  const [decision,setDecision]=useState<'accept'|'return'>('accept');
  const returning=decision==='return';
  return <Modal open title={`验收节点 · ${target.node.name}`} onCancel={onCancel} confirmLoading={pending} okText={returning?'确认退回返工':'确认验收通过'} okButtonProps={{danger:returning,disabled:returning&&!note.trim()}} onOk={()=>onSubmit(note,decision)}>
    <p>{target.orderId} · 版本 v{target.version}</p><p>负责人：{people[target.node.owner]} · 已报告完成 100%</p>
    <Alert type="info" title="验收标准" description={target.node.acceptanceCriteria??'该历史节点尚未配置验收标准，请核实检查依据。'}/>
    <Radio.Group aria-label="验收决定" value={decision} onChange={e=>setDecision(e.target.value)} options={[{value:'accept',label:'验收通过'},{value:'return',label:'退回返工'}]}/>
    <Alert type={returning?'warning':'info'} showIcon title={returning?'退回后开启新一轮返工，节点进度归零，整单加权进度相应回退。上一轮完工与退回记录保留，负责人需重新反馈并报完工。':'确认后，该节点变为已验收，负责人不能继续修改进度。助理会重新读取业务状态。'}/>
    <label htmlFor="acceptance-note">{returning?'退回原因（必填）':'验收说明（选填）'}</label><Input.TextArea id="acceptance-note" aria-label={returning?'退回原因':'验收说明'} rows={3} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder={returning?'具体说明未通过项与返工要求':'记录数量、检查结果或验收依据'}/>
  </Modal>;
}
export function AcceptanceRecords({order}:{order:Order}) {
 const {people,ownerOptions,isManager}=useMembers();
  const records=order.nodes.flatMap(n=>[
    ...(n.acceptance?[{...n.acceptance,nodeId:n.id,name:n.name,decision:'验收通过'}]:[]),
    ...(n.reworks??[]).map((r,i)=>({...r,nodeId:n.id,name:n.name,decision:`第${i+1}次退回返工`}))
  ]).sort((a,b)=>b.at.localeCompare(a.at));
  if(!records.length)return null;
  return <section className="acceptance-records"><h4>节点验收与返工记录</h4>{records.map(r=><div key={`${r.nodeId}-${r.sourceVersion}`}><b>{r.name} · {r.decision}</b><p>{people[r.actor]} · {new Date(r.at).toLocaleString('zh-CN')} · 依据版本 v{r.sourceVersion}</p><p>{r.note||'未填写说明'}</p></div>)}</section>;
}
