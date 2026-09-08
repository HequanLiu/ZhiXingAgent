import {createContext, useContext, useState} from 'react';
import {Alert, Button, Form, Input, Select, Switch, Table, Tag} from 'antd';
import {useIsFetching, useMutation, useQueryClient} from '@tanstack/react-query';
import {BusinessModal, PanelStats} from './BusinessModal';

export interface Member {tenant:string; actor:string; displayName:string; role:'manager'|'member'; enabled:boolean; version:number}
export function memberView(members:Member[], actor:string) {
  return {members, people:Object.fromEntries(members.map(m=>[m.actor,m.displayName])) as Record<string,string>, ownerOptions:members.filter(m=>m.enabled).map(m=>({value:m.actor,label:m.displayName})), isManager:members.some(m=>m.actor===actor&&m.enabled&&m.role==='manager')};
}
export const MembersContext=createContext(memberView([],''));
export const useMembers=()=>useContext(MembersContext);

export function MembersPanel({api,onClose}:{api:(path:string,body?:unknown,key?:string)=>Promise<any>;onClose:()=>void}) {
  const {members,isManager}=useMembers();
  const [search,setSearch]=useState('');
  const [editing,setEditing]=useState<Member|null|undefined>();
  const [form]=Form.useForm();
  const client=useQueryClient();
  const loading=useIsFetching({queryKey:['members']})>0;
  const membersFailed=client.getQueryCache().findAll({queryKey:['members'],type:'active'}).some(query=>query.state.status==='error');
  const mutation=useMutation({mutationFn:(v:any)=>api('/api/members/'+encodeURIComponent(v.actor),{displayName:v.displayName,role:v.role,enabled:v.enabled,expectedVersion:editing?.version??0}),onSuccess:()=>{void client.invalidateQueries({queryKey:['members']});setEditing(undefined);}});
  const filtered=members.filter(m=>`${m.displayName} ${m.actor}`.toLowerCase().includes(search.trim().toLowerCase()));
  const startEditing=(member:Member|null)=>{
    mutation.reset();
    setEditing(member);
    form.resetFields();
    form.setFieldsValue(member??{actor:'',displayName:'',role:'member',enabled:true});
  };
  return <BusinessModal title="人员与角色" description="管理团队成员及其职责。停用人员后，历史业务记录仍会保留。" open width={900} footer={null} onCancel={onClose}>
    <div className="dialog-stack">
      <PanelStats items={[{label:'团队人员',value:members.length},{label:'已启用',value:members.filter(m=>m.enabled).length},{label:'经理',value:members.filter(m=>m.enabled&&m.role==='manager').length}]}/>
      {membersFailed&&<Alert type="error" showIcon title="人员列表读取失败" action={<Button onClick={()=>void client.refetchQueries({queryKey:['members'],type:'active'})}>重试</Button>}/>}
      <div className="dialog-toolbar">
        <Input.Search aria-label="搜索人员" placeholder="搜索姓名或人员编号" allowClear value={search} onChange={e=>setSearch(e.target.value)}/>
        {isManager&&<Button type="primary" onClick={()=>startEditing(null)}>新增人员</Button>}
      </div>
      <Table<Member> rowKey="actor" loading={loading} scroll={{x:'max-content'}} dataSource={filtered} pagination={{pageSize:8}} locale={{emptyText:search?'没有匹配的人员，请尝试其他姓名或编号':'暂无团队人员'}} columns={[
        {title:'姓名',dataIndex:'displayName',render:(name:string,m)=><div><strong>{name}</strong><div className="record-meta">人员编号：{m.actor}</div></div>},
        {title:'角色',render:(_,m)=>m.role==='manager'?'经理':'成员'},
        {title:'状态',render:(_,m)=><Tag color={m.enabled?'green':'default'}>{m.enabled?'已启用':'已停用'}</Tag>},
        {title:'操作',render:(_,m)=>isManager?<Button onClick={()=>startEditing(m)}>编辑</Button>:'仅查看'}
      ]}/>
    </div>
    <BusinessModal title={editing?'编辑人员':'新增人员'} description="姓名用于业务展示，人员编号用于识别身份。" open={editing!==undefined} footer={null} onCancel={()=>setEditing(undefined)}>
      <Form form={form} layout="vertical" initialValues={{role:'member',enabled:true}} onFinish={v=>mutation.mutate(v)}>
        <Form.Item name="displayName" label="姓名" rules={[{required:true,whitespace:true,message:'请输入姓名'}]}><Input maxLength={100} placeholder="请输入真实姓名"/></Form.Item>
        <Form.Item name="actor" label="人员编号" extra="仅支持字母、数字、下划线和短横线，创建后不可修改。" rules={[{required:true,pattern:/^[\w-]{1,60}$/,message:'请输入 1–60 位有效人员编号'}]}><Input disabled={!!editing}/></Form.Item>
        <Form.Item name="role" label="角色" rules={[{required:true}]}><Select options={[{value:'member',label:'成员：反馈自己的节点'},{value:'manager',label:'经理：项目管理、验收及人员管理'}]}/></Form.Item>
        <Form.Item name="enabled" label="允许使用系统" valuePropName="checked"><Switch/></Form.Item>
        {mutation.isError&&<Alert type="error" title="人员保存失败" description={mutation.error.message} showIcon/>}
        <div className="dialog-actions"><Button onClick={()=>setEditing(undefined)}>取消</Button><Button type="primary" htmlType="submit" loading={mutation.isPending}>保存人员</Button></div>
      </Form>
    </BusinessModal>
  </BusinessModal>;
}
