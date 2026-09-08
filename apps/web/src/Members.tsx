import {createContext,useContext,useState} from 'react';
import {Alert,Button,Form,Input,Modal,Select,Switch,Table,Tag} from 'antd';
import {useMutation,useQueryClient} from '@tanstack/react-query';
export interface Member {tenant:string;actor:string;displayName:string;role:'manager'|'member';enabled:boolean;version:number}
export function memberView(members:Member[],actor:string){return {members,people:Object.fromEntries(members.map(m=>[m.actor,m.displayName])) as Record<string,string>,ownerOptions:members.filter(m=>m.enabled).map(m=>({value:m.actor,label:m.displayName})),isManager:members.some(m=>m.actor===actor&&m.enabled&&m.role==='manager')};}
export const MembersContext=createContext(memberView([],''));
export const useMembers=()=>useContext(MembersContext);
export function MembersPanel({api,onClose}:{api:(path:string,body?:unknown,key?:string)=>Promise<any>;onClose:()=>void}){
 const {members,isManager}=useMembers();const[editing,setEditing]=useState<Member|null|undefined>();const[form]=Form.useForm();const client=useQueryClient();
 const mutation=useMutation({mutationFn:(v:any)=>api('/api/members/'+encodeURIComponent(v.actor),{displayName:v.displayName,role:v.role,enabled:v.enabled,expectedVersion:editing?.version??0}),onSuccess:()=>{void client.invalidateQueries({queryKey:['members']});setEditing(undefined);}});
 return <Modal title="人员与角色" open width={800} footer={null} onCancel={onClose}>
 <p>角色按租户生效。停用后不能登录、反馈或被新分配；历史业务记录保留。</p>
 {isManager&&<Button onClick={()=>{setEditing(null);form.resetFields();}}>新增人员</Button>}
 <Table<Member> rowKey="actor" dataSource={members} pagination={{pageSize:8}} columns={[{title:'人员 ID',dataIndex:'actor'},{title:'姓名',dataIndex:'displayName'},{title:'角色',render:(_,m)=>m.role==='manager'?'经理':'成员'},{title:'状态',render:(_,m)=><Tag>{m.enabled?'启用':'停用'}</Tag>},{title:'操作',render:(_,m)=>isManager&&<Button onClick={()=>{setEditing(m);form.setFieldsValue(m);}}>编辑</Button>}]}/>
 {editing!==undefined&&<Form form={form} layout="vertical" initialValues={{role:'member',enabled:true}} onFinish={v=>mutation.mutate(v)}>
 <Form.Item name="actor" label="人员 ID" rules={[{required:true,pattern:/^[\w-]{1,60}$/}]}><Input disabled={!!editing}/></Form.Item>
 <Form.Item name="displayName" label="姓名" rules={[{required:true,whitespace:true}]}><Input maxLength={100}/></Form.Item>
 <Form.Item name="role" label="角色" rules={[{required:true}]}><Select options={[{value:'member',label:'成员：反馈自己的节点'},{value:'manager',label:'经理：项目管理、验收及人员管理'}]}/></Form.Item>
 <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch/></Form.Item>
 {mutation.isError&&<Alert type="error" title={mutation.error.message}/>}
 <Button type="primary" htmlType="submit" loading={mutation.isPending}>保存人员</Button>
 </Form>}
 </Modal>;
}
