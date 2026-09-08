import {AssistantDock} from './AssistantDock';
import {MembersContext,MembersPanel,memberView,type Member} from './Members';
import {WorkflowEditor} from './WorkflowEditor';
import {AttachmentPanel} from './AttachmentPanel';
import {RuntimePanel} from './RuntimePanel';
import {ExceptionPanel} from './ExceptionPanel';
import {ChangePanel} from './ChangePanel';
import {PatrolPanel} from './PatrolPanel';
import {FeedbackEditor} from './FeedbackEditor';
import {ProjectEditor} from './ProjectEditor';
import {NodeAcceptance,AcceptanceRecords,type AcceptanceTarget} from './NodeAcceptance';
import {AnalysisPanel,type Analysis} from './AnalysisPanel';
import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Dropdown,Empty,Form,Input,InputNumber,Modal,Progress,Select,Spin,Table,Tag,message} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {type Order,type SampleNode} from '../../../packages/sampling-contracts/index.ts';
const labels:Record<string,string>={not_started:'待开始',in_progress:'进行中',blocked:'受阻',reported_complete:'待验收',accepted:'已验收',rework:'返工待反馈'};
const errors:Record<string,string>={LAST_MANAGER_REQUIRED:'至少保留一名启用的经理',SOURCE_NOT_CLEAR:'业务问题尚未解除，暂不能关闭',INVALID_TRANSITION:'当前状态不能执行该操作',CHANGE_NOT_APPROVED:'方案尚未批准',CHANGE_ALREADY_APPLIED:'方案已执行，请刷新查看',CHANGE_ALREADY_DECIDED:'方案已审批，请刷新查看',ORDER_EXISTS:'订单号已存在',ANALYSIS_NOT_FAILED:'任务已更新，请刷新后查看',VERSION_CONFLICT:'数据已更新，请刷新后重新提交',FORBIDDEN:'当前身份无权执行此操作',NODE_NOT_READY:'节点尚未报完工，不能验收',IDEMPOTENCY_CONFLICT:'重复请求内容不一致',NODE_CLOSED:'已验收节点不能直接改写',VALIDATION_ERROR:'请检查数量、负责人及输入内容'};
const progress=(o:Order)=>Math.round(o.nodes.reduce((s,n)=>s+n.percent*n.weight,0));
function Speaker(){return <div className="speaker-art" aria-label="音箱示意图"><div className="speaker-top">＋ · −</div><div className="speaker-grille"/><span>SONIC</span></div>;}
export function App({identity,onLogout}:{identity?:{tenant:string;actor:string};onLogout?:()=>void}){
  const mobile=location.pathname==='/mobile';
  const[evidenceOpen,setEvidenceOpen]=useState(false);
  const[analysisOpen,setAnalysisOpen]=useState(false);
  const[configTarget,setConfigTarget]=useState<Order|null>(null);
  const[attachmentsOpen,setAttachmentsOpen]=useState(false);
  const[runtimeOpen,setRuntimeOpen]=useState(false);
  const[exceptionsOpen,setExceptionsOpen]=useState(false);
  const[changesOpen,setChangesOpen]=useState(false);
  const[patrolOpen,setPatrolOpen]=useState(false);
  const[membersOpen,setMembersOpen]=useState(false);
  const[projectOpen,setProjectOpen]=useState(false);
  const[actor,setActor]=useState(identity?.actor??(mobile?'zhao':'chen'));
  const[selected,setSelected]=useState('A26-018');
  const[filter,setFilter]=useState('active');
  const[search,setSearch]=useState('');
  const[feedbackNode,setFeedbackNode]=useState<SampleNode|null>(null);
  const[acceptanceTarget,setAcceptanceTarget]=useState<AcceptanceTarget|null>(null);
  const[assignNode,setAssignNode]=useState<SampleNode|null>(null);
  const[newOwner,setNewOwner]=useState('zhao');
  const[editVersion,setEditVersion]=useState(0);
  const[connected,setConnected]=useState(false);
  const[form]=Form.useForm();const[toast,contextHolder]=message.useMessage();
  const requestKey=useRef('');const client=useQueryClient();
  async function api(path:string,body?:unknown,key?:string){
    const response=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-demo-user':actor,...(key?{'idempotency-key':key}:{})},body:body?JSON.stringify(body):undefined});
    const data=await response.json();if(!response.ok)throw new Error(errors[data.code]??'服务暂不可用，请检查连接后重试');return data;
  }
  const membersQuery=useQuery<Member[]>({queryKey:['members',identity?.tenant??'demo',actor],queryFn:()=>api('/api/members'),refetchInterval:5000});
  const membersValue=memberView(membersQuery.data??[],actor);const {people,ownerOptions,isManager}=membersValue;
  const ordersQuery=useQuery<Order[]>({queryKey:['orders',identity?.tenant??'demo',actor],queryFn:()=>api('/api/soundlab/orders')});
  const activityQuery=useQuery<{event_id:string;summary:string;created_at:string}[]>({queryKey:['activity',identity?.tenant??'demo',actor],queryFn:()=>api('/api/activity')});
  const analysisQuery=useQuery<Analysis[]>({queryKey:['analysis',identity?.tenant??'demo',actor],queryFn:()=>api('/api/analysis')});
  const runtimeQuery=useQuery<{model:string;mode:string;enabled:boolean;online:boolean}>({queryKey:['runtime'],queryFn:()=>api('/api/runtime'),refetchInterval:5000});
  useEffect(()=>{
    const stream=new EventSource('/api/events');
    stream.onopen=()=>setConnected(true);stream.onerror=()=>setConnected(false);
    stream.onmessage=()=>{void client.invalidateQueries({queryKey:['orders']});void client.invalidateQueries({queryKey:['activity']});void client.invalidateQueries({queryKey:['analysis']});};
    return()=>stream.close();
  },[client]);
  const retry=useMutation({mutationFn:(item:Analysis)=>api(`/api/analysis/${encodeURIComponent(item.event_id)}/retry`,{expectedUpdatedAt:item.updated_at}),onSuccess:()=>{void client.invalidateQueries({queryKey:['analysis']});toast.success('已重新排队，历史分析已留存');},onError:(e:Error)=>toast.error(e.message)});
  const orders=ordersQuery.data??[];
  const selectableOrders=mobile?orders.filter(o=>o.nodes.some(n=>n.owner===actor)):orders;
  const order=selectableOrders.find(o=>o.id===selected)??selectableOrders[0];
  const mutation=useMutation({mutationFn:({path,body}:{path:string;body:unknown})=>api(path,body,requestKey.current),onSuccess:()=>{setConfigTarget(null);setProjectOpen(false);setFeedbackNode(null);setAssignNode(null);setAcceptanceTarget(null);void client.invalidateQueries({queryKey:['orders']});toast.success('已保存，正在同步工作台');},onError:(e:Error)=>{toast.error(e.message);void client.invalidateQueries({queryKey:['orders']});}});
  const beginFeedback=(node:SampleNode)=>{requestKey.current=crypto.randomUUID();setEditVersion(order?.version??0);setFeedbackNode(node);form.resetFields();form.setFieldsValue({completed:13,total:20,blocker:''});};
  const visible=orders.filter(o=>(filter==='all'||filter==='active'&&o.nodes.some(n=>n.status!=='accepted')||filter==='completed'&&o.nodes.every(n=>n.status==='accepted')||o.risk===filter&&o.nodes.some(n=>n.status!=='accepted'))&&`${o.id}${o.product}${o.customer}`.toLowerCase().includes(search.toLowerCase()));
  const nodes=order?.nodes??[];
  const outstanding=nodes.filter(n=>n.status==='blocked'||n.status==='reported_complete'||n.status==='rework');
  const feedback=order?.feedback[0];
  const allOutstanding=orders.flatMap(o=>o.nodes.filter(n=>['blocked','reported_complete','rework'].includes(n.status)).map(n=>({order:o,node:n})));
  function assistantCommand(text:string){
    const matched=orders.find(o=>text.toLowerCase().includes(o.id.toLowerCase()));
    if(matched){setSelected(matched.id);setFilter('all');setSearch(matched.id);return `已定位 ${matched.id} · ${matched.product}，节点进度见中间工作区。`;}
    if(/风险|延期/.test(text)){setFilter('risk');setSearch('');return '已筛选交期风险订单。';}
    if(/巡检|规则|跟进/.test(text)){setPatrolOpen(true);return '已打开跟进规则，可查看周期和巡检记录。';}
    if(/异常|待确认/.test(text)){setExceptionsOpen(true);return '已打开异常与待确认事项。';}
    if(/全部|所有/.test(text)){setFilter('all');setSearch('');return '已显示全部订单。';}
    return '请输入已有订单编号，或输入“交期风险”“异常”“跟进规则”。此输入区目前执行工作台快捷指令。';
  }
  const nodeColumns=[{title:'流程节点',dataIndex:'name',render:(name:string,node:SampleNode)=><span><span className={`node-dot ${node.status}`}/>{name}</span>},{title:'负责人',dataIndex:'owner',render:(owner:string)=>people[owner]},{title:'计划完成',dataIndex:'due',render:(due:string)=>due.slice(5)},{title:'最新进度',render:(_:unknown,n:SampleNode)=><Tag color={n.status==='blocked'?'orange':n.status==='accepted'?'green':n.status==='not_started'?'default':'purple'}>{labels[n.status]} {n.status==='in_progress'||n.status==='blocked'?`${n.percent}%`:''}</Tag>},{title:'操作',render:(_:unknown,n:SampleNode)=><div className="node-actions">{n.owner===actor&&n.status!=='accepted'&&<Button size="small" type="link" onClick={()=>beginFeedback(n)}>反馈</Button>}{isManager&&n.status==='reported_complete'&&<Button size="small" type="primary" onClick={()=>{requestKey.current=crypto.randomUUID();setAcceptanceTarget({orderId:order!.id,version:order!.version,node:n});}}>验收</Button>}{isManager&&<Button size="small" type="text" onClick={()=>{requestKey.current=crypto.randomUUID();setEditVersion(order?.version??0);setAssignNode(n);setNewOwner(n.owner);}}>分配</Button>}</div>}];
  return <MembersContext.Provider value={membersValue}><div className={mobile?'app mobile':'app'}>{contextHolder}
    {!mobile&&<aside className="rail"><div className="brand-mark">≋</div><button className="rail-item active" aria-label="打样工作台" onClick={()=>{setFilter('active');setSearch('');}}>⌂</button><button className="rail-item" aria-label="异常与待确认事项" onClick={()=>setExceptionsOpen(true)}>▤</button><button className="rail-item" aria-label="巡检设置与记录" onClick={()=>setPatrolOpen(true)}>◷</button>{isManager&&<><button className="rail-item" aria-label="人员与角色" onClick={()=>setMembersOpen(true)}>♧</button><button className="rail-item" aria-label="运行设置与平台管理" onClick={()=>setRuntimeOpen(true)}>⚙</button></>}<a className="rail-item" href="/mobile" title="打开移动端反馈" target="_blank" rel="noreferrer">↗</a><div className="rail-bottom">声</div></aside>}
    <header className="header"><div className="wordmark">声研<span>实验室</span><i> / </i><small>{mobile?'移动反馈':'Agent 工作台 · 音响工厂'}</small></div><div className="header-right"><span className="demo-label">{identity?identity.tenant:'本地演示 · 示例数据'}</span>{identity?<><span>{people[identity.actor]??identity.actor}</span><Button onClick={onLogout}>退出</Button></>:<Select aria-label="演示身份" value={actor} onChange={value=>{setActor(value);setFeedbackNode(null);setAssignNode(null);setAcceptanceTarget(null);}} options={ownerOptions.map(({value,label})=>({value,label:`${label}${membersValue.members.find(m=>m.actor===value)?.role==='manager'?' · 项目负责人':''}`}))}/>}</div></header>
    {!mobile&&<AssistantDock onEvidence={id=>{setSelected(id);setFilter('all');setSearch(id);void client.invalidateQueries({queryKey:['orders']});}} key={`${identity?.tenant??'demo'}-${actor}`} scope={`${identity?.tenant??'demo'}-${actor}`} api={api} orders={orders} activity={activityQuery.data??[]} online={connected} modelEnabled={!!runtimeQuery.data?.enabled} onCommand={assistantCommand} onPatrol={()=>setPatrolOpen(true)} onRuntime={()=>setRuntimeOpen(true)} isManager={isManager}/>}

    <main className="workspace"><div className="page-title"><div><span className="overline">{mobile?'MY RESPONSIBILITIES':'SAMPLE PORTFOLIO'}</span><h1>{mobile?'我的节点反馈':'打样订单总览'}</h1><p>{mobile?'选择订单，为你负责的节点提交进度。':'把进展看清，把例外提前处理。'}</p></div><Tag color={connected?'green':'orange'}>{connected?'同步已连接':'连接恢复中'}</Tag><Dropdown menu={{items:[{key:'exceptions',label:'异常与待确认事项'},{key:'patrol',label:'巡检设置与记录'},...(isManager?[{key:'runtime',label:'运行设置与平台管理'},{key:'members',label:'人员与角色'}]:[])],onClick:({key})=>{if(key==='exceptions')setExceptionsOpen(true);if(key==='patrol')setPatrolOpen(true);if(key==='runtime')setRuntimeOpen(true);if(key==='members')setMembersOpen(true);}}}><Button>功能菜单</Button></Dropdown></div>
    {ordersQuery.isError&&<Alert type="error" showIcon title="无法读取打样服务" description="请检查服务与数据库，或点击重试。" action={<Button onClick={()=>void ordersQuery.refetch()}>重试</Button>}/>}
    {ordersQuery.isPending?<div className="loading"><Spin/><p>正在读取打样订单…</p></div>:<>
    {!mobile&&<><div className="metrics"><div><span>打样中</span><strong>{orders.filter(o=>o.nodes.some(n=>n.status!=='accepted')).length}<em>单</em></strong></div><div><span>正常推进</span><strong>{orders.filter(o=>o.nodes.some(n=>n.status!=='accepted')&&o.risk==='normal').length}<em>单</em></strong></div><div><span>需关注</span><strong className="amber">{orders.filter(o=>o.nodes.some(n=>n.status!=='accepted')&&o.risk==='attention').length}<em>单</em></strong></div><div><span>交期风险</span><strong className="red">{orders.filter(o=>o.nodes.some(n=>n.status!=='accepted')&&o.risk==='risk').length}<em>单</em></strong></div></div><div className="portfolio card"><div className="table-toolbar"><div className="filters">{[['active','打样中'],['all','全部'],['attention','关注'],['risk','风险'],['completed','完成']].map(([key,label])=><Button type={filter===key?'primary':'text'} key={key} onClick={()=>setFilter(key)}>{label}</Button>)}</div><Input aria-label="搜索订单" placeholder="搜索订单" value={search} onChange={e=>setSearch(e.target.value)} allowClear/>{isManager&&<Button type="primary" aria-label="新建 / 导入项目" onClick={()=>{requestKey.current=crypto.randomUUID();setProjectOpen(true);}}>＋ 新建</Button>}</div><Table<Order> size="small" rowKey="id" dataSource={visible} pagination={{pageSize:4,showSizeChanger:false,size:'small',showTotal:total=>`共 ${total} 单`}} onRow={o=>({onClick:()=>setSelected(o.id),tabIndex:0,onKeyDown:e=>{if(e.key==='Enter')setSelected(o.id);}})} rowClassName={o=>o.id===order?.id?'selected-order':''} columns={[{title:'订单 / 产品',render:(_,o)=><div className="order-cell"><b>{o.id}</b><span>{o.product}</span></div>},{title:'当前节点',render:(_,o)=>o.nodes.find(n=>n.status!=='accepted')?.name??'已完成'},{title:'整体进度',render:(_,o)=><Progress percent={progress(o)} size="small" strokeColor="#8c68dc"/>},{title:'目标寄样',dataIndex:'due',render:(date:string)=>date.slice(5)},{title:'状态',dataIndex:'risk',render:(risk:string)=><Tag color={risk==='normal'?'green':risk==='risk'?'red':'orange'}>{risk==='normal'?'正常':risk==='risk'?'交期风险':'需关注'}</Tag>}]}/></div></>}
    {mobile&&<Select showSearch optionFilterProp="label" className="mobile-order-select" aria-label="选择打样订单" value={order?.id} onChange={setSelected} options={orders.filter(o=>o.nodes.some(n=>n.owner===actor)).map(o=>({value:o.id,label:`${o.id} · ${o.product}`}))}/>}
    {order&&<section className="detail card"><div className="detail-header">{!mobile&&<Speaker/>}<div><span className="overline">SELECTED PROJECT</span><h2>{order.id} <span>· {order.product}打样</span></h2><p>{order.customer} <i> / </i>目标寄样 {order.due.slice(5)} <i> / </i>版本 {order.version}</p></div></div>{mobile?<div className="mobile-nodes">{nodes.filter(n=>n.owner===actor).map(n=><div className="mobile-node" key={n.id}><h3>{n.name}<Tag>{labels[n.status]}</Tag></h3><p>计划完成 {n.due} · {people[n.owner]}</p><Progress percent={n.percent} strokeColor="#7850d8"/>{n.status==='rework'&&<Alert type="warning" title="退回原因" description={n.reworks?.at(-1)?.note}/> }<Button type="primary" block disabled={n.status==='accepted'} onClick={()=>beginFeedback(n)}>提交节点反馈</Button></div>)}</div>:<Table<SampleNode> size="small" rowKey="id" pagination={false} dataSource={nodes} columns={nodeColumns}/>}<div className="detail-actions"><Button size="small" onClick={()=>setAttachmentsOpen(true)}>图片与检测附件</Button>{isManager&&<Button size="small" onClick={()=>{requestKey.current=crypto.randomUUID();setConfigTarget(structuredClone(order));}}>配置节点流程</Button>}<Button size="small" onClick={()=>setChangesOpen(true)}>交期与费用变更</Button><Button size="small" onClick={()=>setEvidenceOpen(true)}>交期依据与验收记录</Button></div><div className="detail-note">ⓘ 人员反馈经核对后更新，保留原始记录。{order.schedule&&` 预计完成：${order.schedule.forecast??'待核实'}`}</div></section>}
    </>}
    <footer>声研实验室 <span>从需求到样机，每一步都有回应。</span></footer></main>
    {!mobile&&<aside className="insights"><section className="attention-section"><div className="section-title"><h3>异常与待确认 <span>{allOutstanding.length}</span></h3><Button size="small" type="text" onClick={()=>setExceptionsOpen(true)}>全部 ↗</Button></div><div className="attention-list">{allOutstanding.length?allOutstanding.slice(0,2).map(({order:o,node:n})=><div className={`exception-card ${n.status==='blocked'?'danger':''}`} key={`${o.id}-${n.id}`}><h4>{n.name} · {labels[n.status]}</h4><b>{o.id} · {o.product}</b><p>{n.status==='rework'?'节点已退回，需按返工要求重新反馈。':n.status==='blocked'?'存在阻塞，需核实恢复时间与交期影响。':'负责人已报告完成，等待授权人员验收。'}</p><div>负责人 {people[n.owner]}</div><Button size="small" onClick={()=>{setSelected(o.id);setFilter('all');setSearch(o.id);}}>查看订单 ↗</Button></div>):<div className="quiet-card">◎<p>当前暂无阻塞或待验收节点<br/><small>持续关注负责人反馈</small></p></div>}</div></section><section className="latest-feedback"><div className="section-title"><h3>负责人最新反馈</h3><span>{order?.id}</span></div>{feedback?<div className="feedback-card"><div className="feedback-person"><span className="avatar">{people[feedback.actor]?.slice(0,1)}</span><div><b>{people[feedback.actor]}</b><small>{nodes.find(n=>n.id===feedback.nodeId)?.name}</small></div><Tag>移动 / Web</Tag></div>{(feedback.round??0)<(nodes.find(n=>n.id===feedback.nodeId)?.reworks?.length??0)&&<Tag color="orange">上一轮反馈，本轮返工进度请查看节点</Tag>}<p>已完成 {feedback.completed}{feedback.mode==='percent'?'%':` / ${feedback.total} 台`}。{feedback.blocker||'未报告阻塞。'}</p><time>{new Date(feedback.at).toLocaleString('zh-CN')}</time><div className="integrated">✓ 已保存业务记录<br/><small>如有阻塞，预计交期待核实。</small></div></div>:<div className="empty-feedback"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待第一条进度反馈"/></div>}<Button className="feedback-record-link" block onClick={()=>setEvidenceOpen(true)}>查看原始反馈与记录 ↗</Button></section><div className="analysis-entry"><span>✧ 声研助理分析</span><Button size="small" onClick={()=>setAnalysisOpen(true)}>查看分析与证据</Button></div></aside>}
    <Modal title="声研助理分析与业务证据" open={analysisOpen} onCancel={()=>setAnalysisOpen(false)} footer={null} width={760}><AnalysisPanel loadEvidence={id=>api(`/api/analysis/${id}/evidence`)} pending={retry.isPending} onRetry={isManager?item=>retry.mutate(item):undefined} items={(analysisQuery.data??[]).filter(item=>item.object_id===order?.id)} error={analysisQuery.isError} versions={Object.fromEntries(orders.map(o=>[o.id,o.version]))}/></Modal>
    <Modal title={`${order?.id??''} · 交期依据与原始记录`} open={evidenceOpen} onCancel={()=>setEvidenceOpen(false)} footer={null} width={780}>{order&&<><AcceptanceRecords order={order}/>{order.schedule&&<div className="schedule-evidence"><h3>交期评估</h3><p>预计完成：{order.schedule.forecast??'待核实'} · 评估日期 {order.schedule.asOf} · 依据版本 v{order.schedule.sourceVersion}</p>{order.schedule.missing.length>0&&<Alert type="warning" title="缺少交期依据" description={order.schedule.missing.join('；')}/>}<details><summary>查看各节点计算依据</summary>{order.schedule.nodes.map(n=><p key={n.nodeId}>{nodes.find(x=>x.id===n.nodeId)?.name}：{n.finish??'待核实'} · {n.basis}</p>)}</details></div>}<section className="acceptance-records"><h4>原始反馈</h4>{order.feedback.length?order.feedback.map((f,i)=><p key={i}>{people[f.actor]??f.actor} · {new Date(f.at).toLocaleString('zh-CN')} · {f.completed}{f.mode==='percent'?'%':` / ${f.total}`} · {f.blocker||'未报告阻塞'}</p>):<p>暂无反馈记录。</p>}</section></>}</Modal>
    {configTarget&&<WorkflowEditor order={configTarget} pending={mutation.isPending} onCancel={()=>setConfigTarget(null)} onSave={body=>mutation.mutate({path:`/api/soundlab/orders/${configTarget.id}/configure`,body})}/>}
    {attachmentsOpen&&order&&<AttachmentPanel key={`${order.tenant}-${order.id}-${actor}`} order={order} actor={actor} api={api} onClose={()=>setAttachmentsOpen(false)}/>}
    {membersOpen&&<MembersPanel api={api} onClose={()=>setMembersOpen(false)}/>}
    {runtimeOpen&&<RuntimePanel tenant={identity?.tenant??'demo'} actor={actor} api={api} onClose={()=>setRuntimeOpen(false)}/>}
    {exceptionsOpen&&<ExceptionPanel tenant={identity?.tenant??'demo'} actor={actor} api={api} onClose={()=>setExceptionsOpen(false)}/>}
    {changesOpen&&order&&<ChangePanel key={`${order.tenant}-${order.id}`} order={order} actor={actor} api={api} onClose={()=>setChangesOpen(false)}/>}
    {patrolOpen&&<PatrolPanel actor={actor} api={api} onClose={()=>setPatrolOpen(false)}/>}
    {projectOpen&&<ProjectEditor existingOrderIds={orders.map(order=>order.id)} api={api} onBatch={body=>mutation.mutate({path:'/api/soundlab/orders/batch',body})} pending={mutation.isPending} onCancel={()=>setProjectOpen(false)} onSave={body=>mutation.mutate({path:'/api/soundlab/orders',body})}/>}
    {acceptanceTarget&&<NodeAcceptance target={acceptanceTarget} pending={mutation.isPending} onCancel={()=>setAcceptanceTarget(null)} onSubmit={(note,decision)=>mutation.mutate({path:`/api/soundlab/orders/${acceptanceTarget.orderId}/${decision}`,body:{nodeId:acceptanceTarget.node.id,expectedVersion:acceptanceTarget.version,note}})}/>}
    {feedbackNode&&<FeedbackEditor key={`${order?.id}-${feedbackNode.id}`} node={feedbackNode} pending={mutation.isPending} onCancel={()=>setFeedbackNode(null)} onSave={input=>mutation.mutate({path:`/api/soundlab/orders/${order?.id}/feedback`,body:{...(input as Record<string,unknown>),nodeId:feedbackNode.id,expectedVersion:editVersion}})}/>}
    <Modal title={`设置负责人 · ${assignNode?.name??''}`} open={!!assignNode} onCancel={()=>setAssignNode(null)} confirmLoading={mutation.isPending} onOk={()=>mutation.mutate({path:`/api/soundlab/orders/${order?.id}/assign`,body:{nodeId:assignNode?.id,owner:newOwner,expectedVersion:editVersion}})}><p>调整节点负责人，后续由该负责人提交反馈。</p><Select style={{width:'100%'}} aria-label="节点负责人" value={newOwner} onChange={setNewOwner} options={ownerOptions}/></Modal>
  </div></MembersContext.Provider>;
}
