import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect,useRef,useState} from 'react';
import {Button,Input} from 'antd';
import type {Order} from '../../../packages/sampling-contracts/index.ts';

export function AssistantDock({orders,activity,online,modelEnabled,onCommand,onPatrol,onRuntime,isManager,api,scope,onEvidence}:{
 onEvidence:(id:string)=>void;scope:string;api:(path:string,body?:unknown)=>Promise<any>;orders:Order[];activity:{event_id:string;summary:string;created_at:string}[];online:boolean;modelEnabled:boolean;
 onCommand:(text:string)=>string;onPatrol:()=>void;onRuntime:()=>void;isManager:boolean;
}){
 const [draft,setDraft]=useState('');const[reply,setReply]=useState('');const client=useQueryClient();const end=useRef<HTMLDivElement>(null);const requestId=useRef<string|null>(null);
 const chat=useQuery<{enabled:boolean;messages:{id:string;message:string;status:string;answer:string|null;model:string|null;error_code:string|null;evidence?:{observedAt:string;orders:{id:string;version:number;overallPercent:number}[]}[]}[]}>({queryKey:['chat',scope],queryFn:()=>api('/api/chat'),refetchInterval:1500});
 const send=useMutation({mutationFn:(message:string)=>{requestId.current??=crypto.randomUUID();return api('/api/chat',{id:requestId.current,message});},onSuccess:()=>{requestId.current=null;setDraft('');setReply('');void client.invalidateQueries({queryKey:['chat',scope]});},onError:()=>setReply('发送未确认，请重试；相同消息不会重复提交。')});
 const handled=useRef(new Set<string>());const hydrated=useRef(false);
 const messages=chat.data?.messages??[];
 useEffect(()=>{if(!chat.data)return;if(!hydrated.current){for(const m of messages)if(m.status==='completed')handled.current.add(m.id);hydrated.current=true;return;}for(const m of messages){if(m.status==='completed'&&!handled.current.has(m.id)){handled.current.add(m.id);const evidence=m.evidence?.at(-1)?.orders[0];if(evidence)onEvidence(evidence.id);}}},[chat.data]);const busy=send.isPending||messages.some(m=>['queued','running'].includes(m.status));
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[messages.at(-1)?.status,messages.length]);
 const active=orders.filter(o=>o.nodes.some(n=>n.status!=='accepted'));
 const pending=active.reduce((sum,o)=>sum+o.nodes.filter(n=>['blocked','reported_complete','rework'].includes(n.status)).length,0);
 function submit(){if(!draft.trim()||busy)return;if(chat.data?.enabled){send.mutate(draft.trim());}else{setReply(onCommand(draft.trim()));setDraft('');}}
 return <aside className={`assistant ${messages.length?'has-conversation':''}`}>
  <div className="assistant-heading"><h2>声研助理</h2><span className={`agent-status ${online?'online':''}`}>● {online?'同步在线':'连接中'}</span></div>
  <div className="assistant-scroll">{messages.length>0&&<section className="agent-conversation" aria-label="模型对话记录">{messages.map(m=><article key={m.id}><div className="chat-user">{m.message}</div><div className="chat-answer">{m.status==='completed'?m.answer:m.status==='failed'?'本次回复未完成，请重新发送。':'声研助理正在思考…'}</div>{m.evidence?.at(-1)?.orders.map(o=><button className="chat-evidence-link" key={o.id} onClick={()=>onEvidence(o.id)}>{o.id} · v{o.version} · 进度 {o.overallPercent}% ↗</button>)}{m.model&&<small>{m.model}</small>}</article>)}<div ref={end}/></section>}
   <section className="agent-section agent-goal"><h3>目标</h3><p>管理全部在制打样订单<br/>跟踪节点、负责人及交期</p><span className="section-symbol">◎</span></section>
   <section className="agent-section agent-overview"><h3>当前概况</h3><p>正在跟踪 <b>{active.length}</b> 个打样项目。<br/><b>{active.filter(o=>o.risk==='risk').length}</b> 单交期风险，<b>{pending}</b> 个节点待处理。</p><span className="section-symbol">↗</span></section>
   <section className="agent-section agent-tasks"><h3>助理任务</h3><ul><li>汇总移动端与 Channel 反馈</li><li>核对节点计划与完成证据</li><li>追踪延期与未回复事项</li><li>上报异常和待确认事项</li></ul></section>
   <section className="agent-section agent-activity"><h3>◷ 本轮跟进</h3><div className="activity">{activity.length?activity.slice(0,3).map(item=><div key={item.event_id}><span className="activity-dot"/><small>{new Date(item.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small><p title={item.summary}>{item.summary}</p></div>):<p className="muted">暂无同步记录，等待负责人反馈。</p>}</div></section>
  </div>
  <div className="agent-compose-area">
   {reply&&<div className="agent-command-reply" role="status">{reply}</div>}
   <form className="agent-composer" onSubmit={e=>{e.preventDefault();submit();}}><Input.TextArea aria-label="声研助理输入" placeholder={chat.data?.enabled?"与声研助理对话…":"查看某个订单，或输入“交期风险”…"} value={draft} onChange={e=>{setDraft(e.target.value);requestId.current=null;}} rows={2} disabled={busy} maxLength={3000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/><Button type="primary" htmlType="submit" aria-label="发送助理指令" loading={send.isPending} disabled={!draft.trim()||busy}>➤</Button></form>
   <small className="command-mode">{chat.data?.enabled?'模型对话 · 已接入只读订单工具':'工作台快捷指令 · 模型对话未启用'}</small>
   <div className="agent-footer-actions"><Button onClick={onPatrol}>◷ 跟进规则</Button>{isManager?<Button onClick={onRuntime}>⚙ 运行设置</Button>:<a href="/mobile">移动端反馈 ↗</a>}</div>
  </div>
 </aside>;
}
