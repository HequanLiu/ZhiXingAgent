import {useMembers} from './Members';
import {useRef} from 'react';import {Alert,Button,Form,Input,InputNumber,Modal,Table,Tag} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import type {Order} from '../../../packages/sampling-contracts/index.ts';
interface Plan {id:string;orderId:string;sourceVersion:number;planVersion:number;due:string;extraCostCents:number;reason:string;status:string}
export function ChangePanel({order,actor,api,onClose}:{order:Order;actor:string;api:(path:string,body?:unknown,key?:string)=>Promise<any>;onClose:()=>void}){
 const {people,ownerOptions,isManager}=useMembers();
 const client=useQueryClient();const[form]=Form.useForm();const proposalKey=useRef(crypto.randomUUID());const executionKeys=useRef(new Map<string,string>());
 const plans=useQuery<Plan[]>({queryKey:['changes',order.tenant,actor],queryFn:()=>api('/api/soundlab/changes')});
 const mutate=useMutation({mutationFn:async(action:{kind:'propose';values:any}|{kind:'approve'|'reject'|'apply';plan:Plan})=>{
  if(action.kind==='propose')return api('/api/soundlab/changes',{...action.values,orderId:order.id,sourceVersion:order.version,extraCostCents:Math.round(action.values.extraCostCents*100)},proposalKey.current);
  if(action.kind==='approve'||action.kind==='reject')return api(`/api/soundlab/changes/${action.plan.id}/decide`,{decision:action.kind,expectedPlanVersion:action.plan.planVersion},crypto.randomUUID());
  const id=action.plan.id;if(!executionKeys.current.has(id))executionKeys.current.set(id,crypto.randomUUID());const key=executionKeys.current.get(id)!;
  try{return await api(`/api/soundlab/changes/${id}/apply`,{},key);}catch(error){try{return await api(`/api/soundlab/invocations?key=${encodeURIComponent(key)}`);}catch{throw error;}}
 },onSuccess:()=>{proposalKey.current=crypto.randomUUID();void client.invalidateQueries({queryKey:['changes']});void client.invalidateQueries({queryKey:['orders']});}});
 const tasks=useQuery<any[]>({queryKey:['change-tasks',order.tenant,actor],queryFn:()=>api('/api/change-tasks'),refetchInterval:5000});
 const delegate=useMutation({mutationFn:(id:string)=>api('/api/change-tasks',{changeId:id}),onSuccess:()=>{void client.invalidateQueries({queryKey:['change-tasks']});}});
 const taskLabels:Record<string,string>={awaiting_approval:'等待人工批准',running:'助理执行中',unknown:'正在核对执行回执',succeeded:'助理已核实完成',failed:'执行失败',needs_attention:'需人工核对',rejected:'方案已拒绝'};
 const labels:Record<string,string>={proposed:'待审批',approved:'已批准，待执行',rejected:'已拒绝',applied:'已执行'};
 return <Modal title={`${order.id} · 交期与费用变更`} open width={950} onCancel={onClose} footer={null}>
  <Alert type="info" title={`当前目标日期 ${order.due} · 订单版本 v${order.version}`} description="方案内容提交后不可修改；业务版本变化后需重新提出方案。费用为本次追加金额，批准与执行均保留记录。"/>
  {isManager&&<Form form={form} layout="vertical" initialValues={{due:order.due,extraCostCents:0}} onFinish={values=>mutate.mutate({kind:'propose',values})}><div className="quantity-grid"><Form.Item name="due" label="拟调整寄样日期" rules={[{required:true}]}><Input type="date"/></Form.Item><Form.Item name="extraCostCents" label="追加费用（元）" rules={[{required:true}]}><InputNumber min={0} precision={2}/></Form.Item></div><Form.Item name="reason" label="变更原因与影响" rules={[{required:true,whitespace:true}]}><Input.TextArea maxLength={500}/></Form.Item><Button type="primary" htmlType="submit" loading={mutate.isPending}>提交待审批方案</Button></Form>}
  {mutate.isError&&<Alert type="error" title={mutate.error.message}/>} {plans.isError&&<Alert type="error" title="方案列表读取失败"/>}
  {delegate.isError&&<Alert type="error" title={delegate.error.message}/>}
  <Table<Plan> rowKey="id" size="small" dataSource={(plans.data??[]).filter(p=>p.orderId===order.id)} pagination={{pageSize:5}} columns={[{title:'依据',render:(_,p)=>`订单v${p.sourceVersion} / 方案v${p.planVersion}`},{title:'拟寄样日期',dataIndex:'due'},{title:'追加费用',render:(_,p)=>`¥${(p.extraCostCents/100).toFixed(2)}`},{title:'原因',dataIndex:'reason'},{title:'状态',render:(_,p)=><Tag>{labels[p.status]}</Tag>},{title:'操作',render:(_,p)=>isManager?<>{['proposed','approved'].includes(p.status)&&!tasks.data?.some(t=>t.change_id===p.id)&&<Button size="small" loading={delegate.isPending} onClick={()=>delegate.mutate(p.id)}>委托助理 · 批准后执行</Button>}{tasks.data?.filter(t=>t.change_id===p.id).map(t=><Tag key={t.id}>{taskLabels[t.status]??t.status}{t.error_code?' · '+t.error_code:''}</Tag>)}{p.status==='proposed'&&<><Button size="small" disabled={p.sourceVersion!==order.version} loading={mutate.isPending} onClick={()=>mutate.mutate({kind:'approve',plan:p})}>批准</Button><Button size="small" loading={mutate.isPending} onClick={()=>mutate.mutate({kind:'reject',plan:p})}>拒绝</Button></>}{p.status==='approved'&&<Button type="primary" size="small" disabled={p.sourceVersion!==order.version} loading={mutate.isPending} onClick={()=>mutate.mutate({kind:'apply',plan:p})}>执行已批准方案</Button>}{p.sourceVersion!==order.version&&p.status!=='applied'&&<small>来源版本已变化</small>}</>:null}]}/>
 </Modal>;
}
