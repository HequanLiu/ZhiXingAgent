import {useMembers} from './Members';
import {Alert,Button,Form,InputNumber,Modal,Select,Switch,Table} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
export function PatrolPanel({actor,api,onClose}:{actor:string;api:(path:string,body?:unknown)=>Promise<any>;onClose:()=>void}){
 const {people,ownerOptions,isManager}=useMembers();
 const client=useQueryClient();const[form]=Form.useForm();
 const query=useQuery({queryKey:['patrol',actor],queryFn:()=>api('/api/patrol'),refetchInterval:5000});
 const save=useMutation({mutationFn:(policy:unknown)=>api('/api/patrol',{policy,expectedVersion:query.data.policy.version}),onSuccess:()=>client.invalidateQueries({queryKey:['patrol']})});
 return <Modal title="自动巡检与跟进记录" open width={850} onCancel={onClose} footer={null}>
  <Alert type="info" title="按上海时区巡检订单，不调用模型。同一问题每天最多生成一条站内提醒；持续异常升级给经理，企业微信发送默认关闭。"/>
  {query.isError&&<Alert type="error" title="无法读取巡检策略"/>}
  {query.data&&<><Form key={query.data.policy.version} form={form} layout="vertical" initialValues={{escalationAfterHours:24,...query.data.policy.policy}} disabled={!isManager} onFinish={values=>save.mutate(values)}>
   <Form.Item name="enabled" label="开启自动巡检" valuePropName="checked"><Switch/></Form.Item><div className="quantity-grid"><Form.Item name="intervalMinutes" label="间隔（分钟）" rules={[{required:true}]}><InputNumber min={1} max={1440} precision={0}/></Form.Item><Form.Item name="weekdays" label="巡检工作日" rules={[{required:true}]}><Select mode="multiple" options={['日','一','二','三','四','五','六'].map((s,value)=>({value,label:'周'+s}))}/></Form.Item><Form.Item name="startHour" label="开始小时" rules={[{required:true}]}><InputNumber min={0} max={23} precision={0}/></Form.Item><Form.Item name="endHour" label="结束小时（不含）" rules={[{required:true}]}><InputNumber min={1} max={24} precision={0}/></Form.Item></div>
   <Form.Item name="orderIds" label="巡检订单范围（留空表示全部，最多 200 个）"><Select mode="tags" tokenSeparators={[',','，']} maxCount={200} placeholder="输入订单编号"/></Form.Item>
   <Form.Item name="escalationAfterHours" label="持续异常升级时限（小时）" rules={[{required:true}]}><InputNumber min={1} max={720} precision={0}/></Form.Item>
   {save.isError&&<Alert type="error" title={save.error.message}/>}<Button htmlType="submit" type="primary" loading={save.isPending}>保存巡检策略</Button>
  </Form><p>策略版本 {query.data.policy.version} · 最近巡检 {query.data.runs[0]?new Date(query.data.runs[0].created_at).toLocaleString('zh-CN'):'尚未执行'}</p>
  <p>策略范围：{query.data.policy.policy.orderIds?.length?query.data.policy.policy.orderIds.join('、'):'全部订单'} · 持续 {query.data.policy.policy.escalationAfterHours??24} 小时升级给经理 · 企业微信发送{query.data.deliveryEnabled?'已启用':'已关闭（待发送记录保留）'}</p>
  <h3>经理升级收件箱</h3><Table size="small" rowKey="id" dataSource={query.data.escalations??[]} pagination={{pageSize:5}} columns={[{title:'订单',dataIndex:'object_id'},{title:'事项',dataIndex:'summary'},{title:'接收人',dataIndex:'owner'}]}/>
  <h3>企业微信通知记录</h3><Table size="small" rowKey="id" dataSource={query.data.notifications??[]} pagination={{pageSize:5}} columns={[{title:'订单',render:(_,r:any)=>r.payload.orderId},{title:'事项',render:(_,r:any)=>r.payload.summary},{title:'接收角色',render:(_,r:any)=>r.payload.owner},{title:'发送状态',dataIndex:'status',render:(s:string)=>({pending:'待发送',sending:'发送中',sent:'已发送',failed:'已知失败',unknown:'结果未知，需人工核实',skipped:'跳过：身份映射不可用'}[s]??s)},{title:'尝试次数',dataIndex:'attempts'}]}/>
  <h3>站内跟进提醒</h3><Table size="small" rowKey="id" dataSource={query.data.inbox} pagination={{pageSize:5}} columns={[{title:'订单',dataIndex:'object_id'},{title:'事项',dataIndex:'summary'},{title:'负责人',dataIndex:'owner'},{title:'日期',dataIndex:'business_date',render:(v:string)=>v.slice(0,10)}]}/></>}
 </Modal>;
}

