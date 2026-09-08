import {useEffect, useRef, useState} from 'react';
import {Alert, Button, Empty, Spin, Tag} from 'antd';
import {BusinessModal, PanelSection, PanelStats} from './BusinessModal';
import {useMembers} from './Members';
import {dateText, nodeStateLabels, percentText, versionLabel} from './evidence-presentation';

export interface Analysis {event_id:string;object_id:string;version:number;status:string;attempts:number;summary:string|null;observed_version:number|null;model:string|null;error_code:string|null;updated_at:string}
const statuses: Record<string, string> = {queued:'等待分析',running:'正在分析',retry:'稍后重试',failed:'分析失败',completed:'分析完成'};
const failures: Record<string, string> = {MODEL_TIMEOUT:'模型请求超时',MODEL_ANALYSIS_FAILED:'模型服务调用失败',EVIDENCE_MISSING:'缺少有效业务证据',MODEL_OUTPUT_INVALID:'模型未返回有效结论',ANALYSIS_SCHEMA_INVALID:'模型结论未通过结构校验',WORKER_STOPPED:'分析服务已停止'};
interface EvidenceNode {id?:string;name?:string;owner?:string;status?:string;percent?:number;plannedDue?:string}
interface EvidenceRow {id?:string;version?:number;at?:string;evidence?:{id?:string;version?:number;product?:string;risk?:string;overallPercent?:number;due?:string;nodes?:EvidenceNode[]}}

function AnalysisText({item, latestVersion}: {item: Analysis; latestVersion?: number}) {
  const historical = item.observed_version != null && latestVersion != null && latestVersion > item.observed_version;
  const conclusion = <p className="analysis-text">{item.summary?.trim() || '本条分析暂无可展示的结论。'}</p>;
  return historical ? <details><summary>{versionLabel(item.observed_version, latestVersion)} · 展开查看结论</summary><p className="muted">仅供追溯，请以最新业务事实和分析为准。</p>{conclusion}</details> : conclusion;
}

export function AnalysisPanel({items,error,versions,onRetry,pending,loadEvidence}: {items:Analysis[];error:boolean;versions:Record<string,number>;onRetry?:(item:Analysis)=>void;pending?:boolean;loadEvidence?:(id:string)=>Promise<any[]>}) {
  const {people} = useMembers();
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [evidenceError, setEvidenceError] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  useEffect(() => () => {request.current += 1;}, []);

  async function openEvidence(item: Analysis) {
    if (!loadEvidence) return;
    const requestId = ++request.current;
    setSelected(item);
    setEvidence([]);
    setEvidenceError(false);
    setLoading(true);
    try {
      const rows = await loadEvidence(item.event_id);
      if (request.current === requestId) setEvidence(Array.isArray(rows) ? rows : []);
    } catch {
      if (request.current === requestId) setEvidenceError(true);
    } finally {
      if (request.current === requestId) setLoading(false);
    }
  }

  function closeEvidence() {
    request.current += 1;
    setSelected(null);
    setLoading(false);
  }

  return <section className="model-analysis">
    <h3>声研助理分析</h3>
    <BusinessModal open={selected !== null} title="分析使用的业务证据" description="这里展示分析当时查询的业务快照，查询后发生的业务变化不会改写历史证据。" onCancel={closeEvidence} footer={null} width={820}>
      <div className="dialog-stack">
        {selected && <div className="evidence-summary"><strong>{selected.object_id}</strong><p className="record-meta">触发版本 v{selected.version} · {versionLabel(selected.observed_version, versions[selected.object_id])}</p></div>}
        {loading ? <div role="status" className="evidence-summary"><Spin/><p>正在读取业务证据…</p></div> : evidenceError ? <Alert showIcon type="error" title="证据暂时无法读取" description="分析记录仍然保留，请重试读取。" action={<Button onClick={() => selected && void openEvidence(selected)}>重新读取</Button>}/> : !evidence.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这条分析暂无可读取的业务证据。"/> : evidence.map((row, index) => {
          const snapshot = row.evidence;
          const orderId = row.id ?? snapshot?.id ?? selected?.object_id ?? '订单待核实';
          const version = row.version ?? snapshot?.version;
          return <PanelSection key={`${orderId}-${index}`} title={`${orderId}${snapshot?.product ? ` · ${snapshot.product}` : ''}`} description={`查询时间 ${dateText(row.at, true)} · ${versionLabel(version, versions[orderId])}`}>
            <div className="dialog-stack">
              <PanelStats items={[{label: '整体进度', value: percentText(snapshot?.overallPercent)}, {label: '目标寄样', value: dateText(snapshot?.due)}, {label: '查询版本', value: version == null ? '待核实' : `v${version}`}]}/>
              {snapshot?.risk && <Tag color={snapshot.risk === 'risk' ? 'red' : snapshot.risk === 'attention' ? 'orange' : 'green'}>查询时状态：{snapshot.risk === 'risk' ? '交期风险' : snapshot.risk === 'attention' ? '需关注' : snapshot.risk === 'normal' ? '正常' : snapshot.risk}</Tag>}
              {snapshot?.nodes?.length ? <div className="dialog-grid">{snapshot.nodes.map((node, nodeIndex) => <article className="record-card" key={node.id ?? nodeIndex}>
                <div className="dialog-toolbar"><strong>{node.name ?? node.id ?? '节点待补充'}</strong><Tag>{nodeStateLabels[node.status ?? ''] ?? node.status ?? '状态待补充'}</Tag></div>
                <p>负责人：{people[node.owner ?? ''] ?? node.owner ?? '待分配'}</p>
                <p><strong>进度 {percentText(node.percent)}</strong></p>
                <p className="record-meta">计划完成 {dateText(node.plannedDue)}</p>
              </article>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本次快照缺少节点明细。"/>}
            </div>
          </PanelSection>;
        })}
      </div>
    </BusinessModal>
    {error ? <Alert type="warning" title="分析记录暂不可用"/> : !items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="节点反馈会创建分析任务，模型启用后开始处理。"/> : <div className="dialog-stack">{items.map(item => <article className="analysis-card record-card" key={item.event_id}>
      <div className="dialog-toolbar"><strong>{item.object_id}</strong><Tag color={item.status === 'completed' ? 'purple' : item.status === 'failed' ? 'red' : 'default'}>{statuses[item.status] ?? item.status}</Tag></div>
      <p className="record-meta">触发版本 v{item.version} · 已尝试 {item.attempts}/3 次 · 更新于 {dateText(item.updated_at, true)}</p>
      {item.status === 'completed' ? <>
        <Tag color={item.observed_version != null && versions[item.object_id] > item.observed_version ? 'orange' : 'default'}>{versionLabel(item.observed_version, versions[item.object_id])}</Tag>
        <AnalysisText item={item} latestVersion={versions[item.object_id]}/>
        <p className="record-meta">分析模型：{item.model || '未记录'} · AI 分析供核实，未执行业务变更。</p>
      </> : <p>{item.status === 'failed' ? `${failures[item.error_code ?? ''] ?? '分析未完成'}，业务反馈已保存。` : item.status === 'retry' ? '模型暂不可用，将自动重试。业务反馈已保存。' : item.status === 'running' ? '正在查询业务证据并生成分析…' : '等待分析服务处理，业务反馈已保存。'}</p>}
      {item.status === 'failed' && <p className="record-meta">本轮分析已停止，可重新发起分析。</p>}
      <div className="dialog-actions">
        {item.status === 'failed' && onRetry && <Button size="small" loading={pending} onClick={() => onRetry(item)}>重新分析</Button>}
        {item.status === 'completed' && loadEvidence && <Button size="small" onClick={() => void openEvidence(item)}>查看业务证据</Button>}
      </div>
    </article>)}</div>}
  </section>;
}
