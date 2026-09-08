import {useState} from 'react';
import {Alert,Button,Modal,Table,Tag} from 'antd';
export interface Analysis {event_id:string;object_id:string;version:number;status:string;attempts:number;summary:string|null;observed_version:number|null;model:string|null;error_code:string|null;updated_at:string}
const statuses:Record<string,string>={queued:'等待分析',running:'正在分析',retry:'稍后重试',failed:'分析失败',completed:'分析完成'};
const failures:Record<string,string>={MODEL_TIMEOUT:'模型请求超时',MODEL_ANALYSIS_FAILED:'模型服务调用失败',EVIDENCE_MISSING:'缺少有效业务证据',MODEL_OUTPUT_INVALID:'模型未返回有效结论',ANALYSIS_SCHEMA_INVALID:'模型结论未通过结构校验',WORKER_STOPPED:'分析服务已停止'};
function AnalysisText({item,latestVersion}:{item:Analysis;latestVersion:number}) {
  const historical=latestVersion>(item.observed_version??0);
  return historical?<details><summary>历史版本 v{item.observed_version}，展开查看</summary><p className="muted">仅供追溯，请以最新业务事实和分析为准。</p><p className="analysis-text">{item.summary}</p></details>:<p className="analysis-text">{item.summary}</p>;
}
export function AnalysisPanel({items,error,versions,onRetry,pending,loadEvidence}:{items:Analysis[];error:boolean;versions:Record<string,number>;onRetry?:(item:Analysis)=>void;pending?:boolean;loadEvidence?:(id:string)=>Promise<any[]>}) {
  const[evidence,setEvidence]=useState<any[]|null>(null);const[evidenceError,setEvidenceError]=useState(false);
  return <section className="model-analysis"><h3>声研助理分析</h3>{evidenceError&&<Alert type="error" title="证据暂时无法读取"/>}<Modal open={evidence!==null} title="分析使用的业务证据" onCancel={()=>setEvidence(null)} footer={null} width={750}>{evidence?.map((r,i)=><div key={i}><p>{r.id} · v{r.version} · 查询时间 {new Date(r.at).toLocaleString('zh-CN')}</p><p>整体进度 {r.evidence?.overallPercent}% · 计划寄样 {r.evidence?.due}</p><Table size="small" pagination={false} rowKey="id" dataSource={r.evidence?.nodes??[]} columns={[{title:'节点',dataIndex:'name'},{title:'负责人代号',dataIndex:'owner'},{title:'进度',render:(_,n:any)=>n.percent+'%'},{title:'计划完成',dataIndex:'plannedDue'}]}/></div>)}</Modal>{error?<Alert type="warning" message="分析记录暂不可用"/>:!items.length?<p className="muted">节点反馈会创建分析任务，模型启用后开始处理。</p>:items.map(item=><article className="analysis-card" key={item.event_id}>
    <div><b>{item.object_id}</b> <Tag color={item.status==='completed'?'purple':item.status==='failed'?'red':'default'}>{statuses[item.status]??item.status}</Tag></div>
    <small>触发版本 v{item.version} · 已尝试 {item.attempts}/3 次</small>
    {item.status==='failed'&&<p className="muted">{failures[item.error_code??'']??'分析未完成'}；已达到本轮重试上限。</p>}
    {item.status==='failed'&&onRetry&&<Button size="small" loading={pending} onClick={()=>onRetry(item)}>重新分析</Button>}
    {item.status==='completed'&&loadEvidence&&<Button size="small" onClick={()=>void loadEvidence(item.event_id).then(rows=>{setEvidence(rows);setEvidenceError(false);}).catch(()=>setEvidenceError(true))}>查看业务证据</Button>}
    {item.status==='completed'?<><AnalysisText item={item} latestVersion={versions[item.object_id]??0}/><small>{item.model} · 查询证据 v{item.observed_version}</small><p className="muted">AI 分析供核实，未执行业务变更。</p></>:<p className="muted">{item.status==='failed'?'未能完成分析，业务反馈已保存。':item.status==='retry'?'模型暂不可用，将自动重试。业务反馈已保存。':item.status==='running'?'正在查询业务证据并生成分析…':'等待分析 Worker 处理，业务反馈已保存。'}</p>}
  </article>)}</section>;
}
