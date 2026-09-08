import {useRef, useState} from 'react';
import {Alert, Button, Empty, Form, Input, Select, Table, Tag, Timeline} from 'antd';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {ExceptionRecord} from '../../zhixing-api/exceptions.ts';
import {useMembers} from './Members';
import {BusinessModal, PanelStats} from './BusinessModal';

const labels:Record<string,string>={open:'待处理',in_progress:'处理中',resolved:'待关闭',closed:'已关闭'};
const colors:Record<string,string>={open:'orange',in_progress:'blue',resolved:'purple',closed:'green'};
export function ExceptionPanel({tenant,actor,api,onClose}:{tenant:string;actor:string;api:(path:string,body?:unknown,key?:string)=>Promise<any>;onClose:()=>void}) {
  const {people,ownerOptions,isManager}=useMembers();
  const client=useQueryClient();
  const [selected,setSelected]=useState<ExceptionRecord|null>(null);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState<string>();
  const key=useRef('');
  const [form]=Form.useForm();
  const query=useQuery<ExceptionRecord[]>({queryKey:['exceptions',tenant,actor],queryFn:()=>api('/api/exceptions'),refetchInterval:5000});
  const mutation=useMutation({mutationFn:(values:any)=>api(`/api/exceptions/${selected!.id}`,{...values,expectedVersion:selected!.version},key.current),onSuccess:()=>{setSelected(null);void client.invalidateQueries({queryKey:['exceptions']});}});
  const records=query.data??[];
  const filtered=records.filter(e=>(!status||e.status===status)&&`${e.objectId} ${e.summary} ${people[e.owner]??e.owner}`.toLowerCase().includes(search.trim().toLowerCase()));
  const history=(record:ExceptionRecord)=>record.audit.length?<Timeline items={record.audit.map(a=>({content:<div><strong>{a.actor==='patrol'?'自动巡检':people[a.actor]??a.actor}</strong><p>{a.note}</p><div className="record-meta">{new Date(a.at).toLocaleString('zh-CN')}{a.to?` · ${labels[a.to]}`:''}</div></div>}))}/>:<Empty description="暂无跟进记录" image={Empty.PRESENTED_IMAGE_SIMPLE}/>;
  return <BusinessModal title="异常与待确认事项" description="查看业务异常、明确负责人，并记录每一次跟进。" open width={1100} onCancel={onClose} footer={null}>
    <div className="dialog-stack">
      <PanelStats items={Object.entries(labels).map(([value,label])=>({label,value:records.filter(e=>e.status===value).length}))}/>
      <Alert type="info" showIcon title="业务问题处理后，巡检会再次核实；来源解除后，经理可关闭事项。"/>
      {query.isError&&<Alert type="error" showIcon title="异常列表读取失败" action={<Button onClick={()=>void query.refetch()}>重试</Button>}/>}
      <div className="dialog-toolbar">
        <Input.Search aria-label="搜索异常" placeholder="搜索订单、问题或负责人" allowClear value={search} onChange={e=>setSearch(e.target.value)}/>
        <Select aria-label="筛选处理状态" placeholder="全部状态" allowClear value={status} onChange={setStatus} options={Object.entries(labels).map(([value,label])=>({value,label}))}/>
      </div>
      <Table<ExceptionRecord> size="small" rowKey="id" loading={query.isLoading} scroll={{x:'max-content'}} dataSource={filtered} pagination={{pageSize:8}} locale={{emptyText:search||status?'没有符合筛选条件的事项':'暂无异常事项'}} expandable={{expandedRowRender:history,expandRowByClick:true}} columns={[
        {title:'订单',dataIndex:'objectId'},
        {title:'问题',dataIndex:'summary'},
        {title:'负责人',render:(_,e)=>people[e.owner]??e.owner},
        {title:'处理状态',render:(_,e)=><Tag color={colors[e.status]}>{labels[e.status]}</Tag>},
        {title:'业务问题',render:(_,e)=><Tag color={e.sourceClear?'green':'orange'}>{e.sourceClear?'已解除':'仍存在'}</Tag>},
        {title:'操作',render:(_,e)=>e.status!=='closed'&&(isManager||actor===e.owner)?<Button onClick={event=>{event.stopPropagation();key.current=crypto.randomUUID();mutation.reset();setSelected(e);form.resetFields();}}>跟进</Button>:<span className="record-meta">展开查看记录</span>}
      ]}/>
    </div>
    <BusinessModal title="跟进异常" description={selected?.summary} open={!!selected} onCancel={()=>setSelected(null)} footer={null}>
      {selected&&<div className="status-summary"><span>订单 {selected.objectId}</span><Tag color={colors[selected.status]}>{labels[selected.status]}</Tag><span>负责人：{people[selected.owner]??selected.owner}</span></div>}
      <Form form={form} layout="vertical" onFinish={v=>mutation.mutate(v)}>
        {isManager&&<Form.Item name="owner" label="重新分配负责人"><Select allowClear placeholder="保持当前负责人" options={ownerOptions}/></Form.Item>}
        <Form.Item name="status" label="处理状态"><Select allowClear placeholder="请选择下一步状态" options={(selected?.status==='open'?['in_progress','resolved']:selected?.status==='in_progress'?['resolved']:selected?.status==='resolved'?['in_progress',...(isManager&&selected.sourceClear?['closed']:[])]:[]).map(value=>({value,label:labels[value]}))}/></Form.Item>
        <Form.Item name="note" label="处理说明" rules={[{required:true,whitespace:true,message:'请填写本次跟进的处理说明'}]}><Input.TextArea rows={4} maxLength={1000} showCount placeholder="记录处理进展、结果或需要协助的事项"/></Form.Item>
        {mutation.isError&&<Alert type="error" title="跟进保存失败" description={mutation.error.message} showIcon/>}
        <div className="dialog-actions"><Button onClick={()=>setSelected(null)}>取消</Button><Button type="primary" htmlType="submit" loading={mutation.isPending}>保存跟进记录</Button></div>
      </Form>
      <details><summary>历史跟进记录</summary>{selected&&history(selected)}</details>
    </BusinessModal>
  </BusinessModal>;
}
