import {Alert, Button, Form, InputNumber, Select, Skeleton, Switch, Table, Tabs, Tag} from 'antd';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useMembers} from './Members';
import {BusinessModal, PanelSection, PanelStats} from './BusinessModal';

export function PatrolPanel({actor,api,onClose}:{actor:string;api:(path:string,body?:unknown)=>Promise<any>;onClose:()=>void}) {
  const {people,isManager}=useMembers();
  const client=useQueryClient();
  const [form]=Form.useForm();
  const query=useQuery({queryKey:['patrol',actor],queryFn:()=>api('/api/patrol'),refetchInterval:5000});
  const save=useMutation({mutationFn:(policy:unknown)=>api('/api/patrol',{policy,expectedVersion:query.data.policy.version}),onSuccess:()=>client.invalidateQueries({queryKey:['patrol']})});
  const data=query.data;
  const policy=data?.policy.policy;
  return <BusinessModal title="自动巡检与跟进记录" description="设置订单巡检时间，查看提醒、经理升级和企业微信通知。" open width={1000} onCancel={onClose} footer={null}>
    <div className="dialog-stack">
      {query.isError&&<Alert type="error" showIcon title="无法读取巡检信息" action={<Button onClick={()=>void query.refetch()}>重试</Button>}/>}
      {query.isLoading&&<Skeleton active paragraph={{rows:5}}/>}
      {data&&<>
        <PanelStats items={[{label:'自动巡检',value:policy.enabled?'已开启':'已关闭'},{label:'巡检范围',value:policy.orderIds?.length?`${policy.orderIds.length} 个订单`:'全部订单'},{label:'异常升级时限',value:`${policy.escalationAfterHours??24} 小时`}]}/>
        <div className="record-meta">最近巡检：{data.runs[0]?new Date(data.runs[0].created_at).toLocaleString('zh-CN'):'尚未执行'}</div>
        <Tabs items={[
          {key:'settings',label:'巡检设置',children:<PanelSection title="自动巡检规则" description="按上海时区运行，同一问题每天最多生成一条站内提醒。持续异常会升级给经理。">
            {!isManager&&<Alert type="info" title="当前为只读查看，巡检设置由经理维护。" showIcon/>}
            <Form key={data.policy.version} form={form} layout="vertical" initialValues={{escalationAfterHours:24,...policy}} disabled={!isManager} onFinish={values=>save.mutate(values)}>
              <Form.Item name="enabled" label="开启自动巡检" valuePropName="checked"><Switch/></Form.Item>
              <div className="dialog-grid">
                <Form.Item name="intervalMinutes" label="巡检间隔（分钟）" rules={[{required:true}]}><InputNumber min={1} max={1440} precision={0}/></Form.Item>
                <Form.Item name="weekdays" label="巡检工作日" rules={[{required:true}]}><Select mode="multiple" options={['日','一','二','三','四','五','六'].map((s,value)=>({value,label:'周'+s}))}/></Form.Item>
                <Form.Item name="startHour" label="开始时间（小时）" rules={[{required:true}]}><InputNumber min={0} max={23} precision={0}/></Form.Item>
                <Form.Item name="endHour" label="结束时间（不含该小时）" rules={[{required:true}]}><InputNumber min={1} max={24} precision={0}/></Form.Item>
              </div>
              <Form.Item name="orderIds" label="巡检订单范围" extra="留空表示全部订单，最多指定 200 个订单。"><Select mode="tags" tokenSeparators={[',','，']} maxCount={200} placeholder="输入订单编号，回车添加"/></Form.Item>
              <Form.Item name="escalationAfterHours" label="持续异常多久后升级给经理（小时）" rules={[{required:true}]}><InputNumber min={1} max={720} precision={0}/></Form.Item>
              {save.isError&&<Alert type="error" showIcon title="巡检设置保存失败" description={save.error.message}/>}
              {save.isSuccess&&<Alert type="success" showIcon title="巡检设置已保存"/>}
              <div className="dialog-actions"><Button htmlType="submit" type="primary" loading={save.isPending}>保存巡检策略</Button></div>
            </Form>
            <details><summary>技术详情</summary><p className="record-meta">策略版本 {data.policy.version}。自动巡检不调用模型。</p></details>
          </PanelSection>},
          {key:'inbox',label:'站内提醒',children:<PanelSection title="站内跟进提醒" description="查看自动巡检产生的业务跟进事项。">
            <Table size="small" rowKey="id" loading={query.isLoading} scroll={{x:'max-content'}} dataSource={data.inbox??[]} pagination={{pageSize:5}} locale={{emptyText:'暂无站内跟进提醒'}} columns={[{title:'订单',dataIndex:'object_id'},{title:'事项',dataIndex:'summary'},{title:'负责人',dataIndex:'owner',render:(v:string)=>people[v]??v},{title:'日期',dataIndex:'business_date',render:(v:string)=>v.slice(0,10)}]}/>
          </PanelSection>},
          {key:'escalations',label:'经理升级',children:<PanelSection title="经理升级收件箱" description="持续未解除、已达到升级时限的事项。">
            <Table size="small" rowKey="id" loading={query.isLoading} scroll={{x:'max-content'}} dataSource={data.escalations??[]} pagination={{pageSize:5}} locale={{emptyText:'暂无需要经理跟进的升级事项'}} columns={[{title:'订单',dataIndex:'object_id'},{title:'事项',dataIndex:'summary'},{title:'接收人',dataIndex:'owner',render:(v:string)=>people[v]??v}]}/>
          </PanelSection>},
          {key:'notifications',label:'企业微信记录',children:<PanelSection title="企业微信通知记录" description={data.deliveryEnabled?'企业微信发送已启用。':'企业微信发送已关闭，待发送记录会保留。'}>
            <Table size="small" rowKey="id" loading={query.isLoading} scroll={{x:'max-content'}} dataSource={data.notifications??[]} pagination={{pageSize:5}} locale={{emptyText:'暂无企业微信通知记录'}} columns={[{title:'订单',render:(_,r:any)=>r.payload.orderId},{title:'事项',render:(_,r:any)=>r.payload.summary},{title:'接收人',render:(_,r:any)=>people[r.payload.owner]??r.payload.owner},{title:'发送状态',dataIndex:'status',render:(s:string)=><Tag color={s==='sent'?'green':s==='failed'||s==='unknown'?'orange':'default'}>{{pending:'待发送',sending:'发送中',sent:'已发送',failed:'发送失败',unknown:'结果未知，需人工核实',skipped:'已跳过：未匹配身份'}[s]??s}</Tag>},{title:'尝试次数',dataIndex:'attempts'}]}/>
          </PanelSection>}
        ]}/>
      </>}
    </div>
  </BusinessModal>;
}
