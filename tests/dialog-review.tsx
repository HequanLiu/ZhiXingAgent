// Isolated visual fixture: all API calls stay in memory; never mutates project data.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button, ConfigProvider, Select} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BusinessModal} from '../apps/zhixing-web/src/BusinessModal';
import {MembersContext, memberView, MembersPanel} from '../apps/zhixing-web/src/Members';
import {AnalysisPanel, type Analysis} from '../apps/zhixing-web/src/AnalysisPanel';
import {OrderEvidence} from '../apps/zhixing-web/src/OrderEvidence';
import {FeedbackEditor} from '../apps/zhixing-web/src/FeedbackEditor';
import {NodeAcceptance} from '../apps/zhixing-web/src/NodeAcceptance';
import {ExceptionPanel} from '../apps/zhixing-web/src/ExceptionPanel';
import {ProjectEditor} from '../apps/zhixing-web/src/ProjectEditor';
import {WorkflowEditor} from '../apps/zhixing-web/src/WorkflowEditor';
import {AttachmentPanel} from '../apps/zhixing-web/src/AttachmentPanel';
import {ChangePanel} from '../apps/zhixing-web/src/ChangePanel';
import type {Order} from '../packages/sampling-contracts/index';
import '../apps/zhixing-web/src/style.css';

const order:Order={id:'UI-DEMO',tenant:'review',product:'客户体验验收音箱',customer:'隔离模拟数据',version:3,due:'2026-10-01',risk:'attention',forecast:null,nodes:[{id:'sample',name:'样机装配',owner:'chen',due:'2026-09-20',percent:100,status:'reported_complete',weight:1,durationDays:2,dependencies:[],acceptanceCriteria:'确认外观、装配数量与通电检测全部通过。'}],feedback:[{id:'f1',nodeId:'sample',actor:'chen',completed:10,total:10,at:'2026-09-08T07:00:00Z',blocker:'待验收，请协助安排检测。'}],calendar:{weekdays:[1,2,3,4,5],holidays:[]}};
const analysis:Analysis={event_id:'review-analysis',object_id:order.id,version:2,observed_version:2,status:'completed',attempts:1,summary:'样机装配已完成，下一步请核对检测记录并安排验收。',model:'演示模型',error_code:null,updated_at:'2026-09-08T07:00:00Z'};
const evidence=[{id:order.id,version:2,at:analysis.updated_at,evidence:{overallPercent:100,due:order.due,nodes:order.nodes.map(n=>({...n,plannedDue:n.due}))}}];
const members=[{tenant:'review',actor:'chen',displayName:'陈静',role:'manager' as const,enabled:true,version:1}];
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Review(){
 const [panel,setPanel]=useState('');const [mode,setMode]=useState('success');const [saved,setSaved]=useState('');
 const close=()=>setPanel('');
 const save=(body:unknown)=>{setSaved(JSON.stringify(body));close();};
 const api=async(path:string,body?:unknown):Promise<any>=>{
  if(body!==undefined){setSaved(JSON.stringify({path,body}));return {};}
  if(path==='/api/members')return members;
  if(path==='/api/exceptions')return [{id:'exception',objectId:order.id,summary:'样机待检测，请协调验收安排',owner:'chen',status:'open',sourceClear:false,version:1,audit:[{actor:'chen',at:analysis.updated_at,note:'已联系品质人员，等待反馈。'}]}];
  return [];
 };
 const loadEvidence=async()=>{await new Promise(r=>setTimeout(r,mode==='slow'?4000:350));if(mode==='error')throw Error('simulated');return mode==='empty'?[]:evidence;};
 return <main style={{padding:24}}><h1>弹框隔离验收</h1><p>模拟数据，无网络写入。用于检查空态、失败、关闭竞态与表单校验。</p><Select aria-label="证据响应模式" value={mode} onChange={setMode} style={{width:180}} options={[{value:'success',label:'正常证据'},{value:'empty',label:'空证据'},{value:'error',label:'读取失败'},{value:'slow',label:'延迟 4 秒'}]}/><div className="dialog-toolbar" style={{marginTop:20}}>{['分析','反馈记录','提交反馈','验收','异常','人员','新建','流程','附件','变更'].map(name=><Button key={name} onClick={()=>setPanel(name)}>{name}</Button>)}</div><output aria-label="模拟提交结果">{saved}</output>
 {panel==='分析'&&<BusinessModal title="声研助理分析与业务证据" open footer={null} onCancel={close}><AnalysisPanel items={[analysis]} versions={{[order.id]:3}} error={false} loadEvidence={loadEvidence}/></BusinessModal>}
 {panel==='反馈记录'&&<BusinessModal title="反馈记录" open footer={null} onCancel={close}><OrderEvidence order={order}/></BusinessModal>}
 {panel==='提交反馈'&&<FeedbackEditor node={order.nodes[0]} pending={false} onCancel={close} onSave={save}/>}
 {panel==='验收'&&<NodeAcceptance target={{orderId:order.id,version:3,node:order.nodes[0]}} pending={false} onCancel={close} onSubmit={(note,decision)=>save({note,decision})}/>}
 {panel==='异常'&&<ExceptionPanel tenant="review" actor="chen" api={api} onClose={close}/>}
 {panel==='人员'&&<MembersPanel api={api} onClose={close}/>}
 {panel==='新建'&&<ProjectEditor existingOrderIds={[]} api={api} pending={false} onCancel={close} onSave={save} onBatch={save}/>}
 {panel==='流程'&&<WorkflowEditor order={order} pending={false} onCancel={close} onSave={save}/>}
 {panel==='附件'&&<AttachmentPanel order={order} actor="chen" api={api} onClose={close}/>}
 {panel==='变更'&&<ChangePanel order={order} actor="chen" api={api} onClose={close}/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{token:{colorPrimary:'#7850d8',borderRadius:9,fontFamily:'"Microsoft YaHei",sans-serif'}}}><QueryClientProvider client={client}><MembersContext.Provider value={memberView(members,'chen')}><Review/></MembersContext.Provider></QueryClientProvider></ConfigProvider>);
