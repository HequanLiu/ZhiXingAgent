import {Alert, Empty, Tabs, Tag, Timeline} from 'antd';
import type {Order} from '../../../packages/sampling-contracts/index.ts';
import {PanelSection, PanelStats} from './BusinessModal';
import {useMembers} from './Members';
import {dateText, feedbackProgress, newestFirst, percentText, versionLabel} from './evidence-presentation';

export function OrderEvidence({order}: {order: Order}) {
  const {people} = useMembers();
  const feedback = newestFirst(order.feedback);
  const reviews = newestFirst(order.nodes.flatMap(node => [
    ...(node.acceptance ? [{...node.acceptance, nodeId: node.id, name: node.name, decision: '验收通过', previousPercent: undefined as number | undefined}] : []),
    ...(node.reworks ?? []).map((record, index) => ({...record, nodeId: node.id, name: node.name, decision: `第 ${index + 1} 次退回返工`})),
  ]));
  const schedule = order.schedule;
  return <Tabs defaultActiveKey="feedback" items={[
    {key: 'feedback', label: `反馈记录（${feedback.length}）`, children: <PanelSection title="负责人反馈" description="按提交时间倒序保留原始反馈；返工前后的进度分别记录。">
      {feedback.length ? <Timeline className="evidence-timeline" items={feedback.map(record => {
        const node = order.nodes.find(item => item.id === record.nodeId);
        const historical = (record.round ?? 0) < (node?.reworks?.length ?? 0);
        return {key: record.id, color: record.blocker ? 'orange' : 'purple', content: <article className="record-card">
          <div className="dialog-toolbar"><strong>{node?.name ?? record.nodeId}</strong><Tag color={historical ? 'orange' : 'default'}>{historical ? '历史轮次反馈' : '本轮反馈'} · 第 {(record.round ?? 0) + 1} 轮</Tag></div>
          <p className="record-meta">{people[record.actor] ?? record.actor} · {dateText(record.at, true)}</p>
          <p><strong>{feedbackProgress(record)}</strong></p>
          <p>阻塞情况：{record.blocker || '未报告阻塞'}</p>
          <div className="record-meta">预计完成：{dateText(record.expectedFinish)} · 物料到齐：{dateText(record.materialEta)}</div>
        </article>};
      })}/> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无反馈，负责人提交后会在此保留原始记录。"/>}
    </PanelSection>},
    {key: 'acceptance', label: `验收与返工（${reviews.length}）`, children: <PanelSection title="验收与返工记录" description="保留验收决定、退回原因及当时依据的业务版本。">
      <div className="dialog-stack">{reviews.length ? reviews.map((record, index) => <article className="record-card" key={`${record.nodeId}-${record.sourceVersion}-${index}`}>
        <div className="dialog-toolbar"><strong>{record.name}</strong><Tag color={record.decision === '验收通过' ? 'green' : 'orange'}>{record.decision}</Tag></div>
        <p className="record-meta">{people[record.actor] ?? record.actor} · {dateText(record.at, true)} · 依据版本 v{record.sourceVersion}</p>
        <p>{record.note || '未填写说明'}</p>
        {record.previousPercent !== undefined && <p className="record-meta">退回前进度 {percentText(record.previousPercent)}；本次退回后开启新一轮返工。</p>}
      </article>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无验收或返工记录。"/>}</div>
    </PanelSection>},
    {key: 'schedule', label: '交期依据', children: <div className="dialog-stack">
      <PanelStats items={[{label: '目标寄样', value: dateText(order.due)}, {label: '预计完成', value: schedule?.forecast ? dateText(schedule.forecast) : '待核实'}, {label: '评估日期', value: dateText(schedule?.asOf)}]}/>
      {schedule ? <>
        <Alert showIcon type={schedule.risk === 'risk' ? 'error' : schedule.risk === 'attention' ? 'warning' : 'info'} title={schedule.risk === 'risk' ? '交期存在风险' : schedule.risk === 'attention' ? '交期需要关注' : '当前交期评估正常'} description={`${versionLabel(schedule.sourceVersion, order.version)} · 评估结果基于当时的节点与工作日配置。`}/>
        {schedule.missing.length > 0 && <Alert showIcon type="warning" title="还需要补充交期依据" description={<ul>{schedule.missing.map((item, index) => <li key={index}>{item}</li>)}</ul>}/>}
        <PanelSection title="各节点计算依据" description="展开查看预计开始、完成日期及计算说明。">
          <div className="dialog-stack">{schedule.nodes.length ? schedule.nodes.map(item => <details className="record-card" key={item.nodeId}>
            <summary>{order.nodes.find(node => node.id === item.nodeId)?.name ?? item.nodeId} · 预计完成 {item.finish ? dateText(item.finish) : '待核实'}</summary>
            <p className="record-meta">预计开始 {item.start ? dateText(item.start) : '待核实'} · 预计完成 {item.finish ? dateText(item.finish) : '待核实'}</p>
            <p>{item.basis || '计算依据待补充'}</p>
          </details>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无节点计算依据。"/>}</div>
        </PanelSection>
      </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未生成交期评估，请先补充节点进度与预计时间。"/>}
    </div>},
  ]}/>;
}
