import {useMembers} from './Members';
import {useRef,useState} from 'react';import {Alert,Button,Form,Input,Modal,Select,Table,Tag} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import type {ExceptionRecord} from '../../platform-api/exceptions.ts';
export function ExceptionPanel({tenant,actor,api,onClose}:{tenant:string;actor:string;api:(path:string,body?:unknown,key?:string)=>Promise<any>;onClose:()=>void}) {
 const {people,ownerOptions,isManager}=useMembers();
 const client=useQueryClient();const[selected,setSelected]=useState<ExceptionRecord|null>(null);const key=useRef('');const[form]=Form.useForm();
 const query=useQuery<ExceptionRecord[]>({queryKey:['exceptions',tenant,actor],queryFn:()=>api('/api/exceptions'),refetchInterval:5000});
 const mutation=useMutation({mutationFn:(values:any)=>api(`/api/exceptions/${selected!.id}`,{...values,expectedVersion:selected!.version},key.current),onSuccess:()=>{setSelected(null);void client.invalidateQueries({queryKey:['exceptions']});}});
 const labels:Record<string,string>={open:'待处理',in_progress:'处理中',resolved:'已处理，待关闭',closed:'已关闭'};
 return <Modal title="异常与待确认事项" open width={1000} onCancel={onClose} footer={null}>
  <Alert type="info" title="异常由自动巡检更新。处理业务问题后，下一次巡检会核实来源是否解除；项目负责人随后可关闭事项。"/>
  {query.isError&&<Alert type="error" title="异常列表读取失败"/>}
  <Table<ExceptionRecord> size="small" rowKey="id" dataSource={query.data??[]} pagination={{pageSize:8}} expandable={{expandedRowRender:e=><div>{e.audit.map((a,i)=><p key={i}>{new Date(a.at).toLocaleString('zh-CN')} · {people[a.actor]??a.actor} · {a.note}</p>)}</div>}} columns={[{title:'订单',dataIndex:'objectId'},{title:'问题',dataIndex:'summary'},{title:'负责人',render:(_,e)=>people[e.owner]??e.owner},{title:'状态',render:(_,e)=><Tag>{labels[e.status]}</Tag>},{title:'业务来源',render:(_,e)=><Tag color={e.sourceClear?'green':'orange'}>{e.sourceClear?'已解除':'仍存在'}</Tag>},{title:'操作',render:(_,e)=>e.status!=='closed'&&(isManager||actor===e.owner)?<Button onClick={()=>{key.current=crypto.randomUUID();setSelected(e);form.resetFields();}}>跟进</Button>:null}]}/>
  <Modal title={selected?.summary} open={!!selected} onCancel={()=>setSelected(null)} footer={null}><Form form={form} layout="vertical" onFinish={v=>mutation.mutate(v)}>
   {isManager&&<Form.Item name="owner" label="重新分配负责人"><Select allowClear options={ownerOptions}/></Form.Item>}
   <Form.Item name="status" label="处理状态"><Select allowClear options={(selected?.status==='open'?['in_progress','resolved']:selected?.status==='in_progress'?['resolved']:selected?.status==='resolved'?['in_progress',...(isManager&&selected.sourceClear?['closed']:[])]:[]).map(value=>({value,label:labels[value]}))}/></Form.Item><Form.Item name="note" label="处理说明" rules={[{required:true,whitespace:true}]}><Input.TextArea maxLength={1000}/></Form.Item>{mutation.isError&&<Alert type="error" title={mutation.error.message}/>}<Button type="primary" htmlType="submit" loading={mutation.isPending}>保存跟进记录</Button>
  </Form></Modal>
 </Modal>;
}
