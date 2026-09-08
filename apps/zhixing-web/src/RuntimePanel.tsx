import {useRef} from 'react';
import {Alert, Button, Empty, Form, Input, InputNumber, Select, Skeleton, Switch, Table, Tabs, Tag} from 'antd';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useMembers} from './Members';
import {BusinessModal, PanelSection} from './BusinessModal';

export function RuntimePanel({actor,tenant,api,onClose}:{actor:string;tenant:string;api:(path:string,body?:unknown,key?:string)=>Promise<any>;onClose:()=>void}) {
  const {isManager}=useMembers();
  const client=useQueryClient();
  const key=useRef(crypto.randomUUID());
  const config=useQuery({queryKey:['runtime-settings',tenant,actor],queryFn:()=>api('/api/settings/runtime')});
  const runtime=useQuery({queryKey:['runtime'],queryFn:()=>api('/api/runtime'),refetchInterval:5000});
  const ops=useQuery({queryKey:['operations',tenant,actor],queryFn:()=>api('/api/operations'),enabled:isManager,refetchInterval:5000});
  const capabilities=useQuery({queryKey:['capabilities',tenant,actor],queryFn:()=>api('/api/capabilities')});
  const installation=useQuery({queryKey:['installations',tenant,actor],queryFn:()=>api('/api/installations')});
  const bindingKey=useRef(crypto.randomUUID());
  const bind=useMutation({mutationFn:(v:any)=>api('/api/installations',{...v,expectedVersion:installation.data.version},bindingKey.current),onSuccess:()=>{bindingKey.current=crypto.randomUUID();void client.invalidateQueries({queryKey:['installations']});}});
  const save=useMutation({mutationFn:(values:any)=>{const {modelId,baseURL,...rest}=values;return api('/api/settings/runtime',{expectedVersion:config.data.version,settings:{...rest,...(modelId?{modelId}:{}),...(baseURL?{baseURL}: {})}},key.current);},onSuccess:()=>{key.current=crypto.randomUUID();void client.invalidateQueries({queryKey:['runtime-settings']});}});
  const taskLabels:Record<string,string>={pending:'等待处理',queued:'排队中',running:'分析中',completed:'已完成',succeeded:'已完成',failed:'失败',cancelled:'已取消',unknown:'结果待核实'};
  return <BusinessModal title="运行设置与平台管理" description="管理分析服务、业务场景连接，并查看运行情况。" open width={1050} onCancel={onClose} footer={null}>
    <div className="dialog-stack">
      <Alert type={runtime.isError?'warning':'info'} showIcon title={runtime.isError?'运行状态暂时无法读取':runtime.data?.mode??'正在读取运行状态'} description="设置将在当前分析结束后生效。"/>
      {ops.data?.health?.alerts?.map((a:any)=><Alert key={a.code} type={a.severity==='error'?'error':'warning'} showIcon title={a.message}/>)}
      <Tabs items={[
        {key:'settings',label:'运行设置',children:<PanelSection title="模型分析服务" description="选择供应商并控制是否启用模型分析。密钥由服务器管理，页面不读取或保存密钥。">
          {config.isLoading&&<Skeleton active paragraph={{rows:4}}/>}
          {config.isError&&<Alert type="error" title="无法读取运行设置" showIcon action={<Button onClick={()=>void config.refetch()}>重试</Button>}/>}
          {!isManager&&<Alert type="info" title="当前为只读查看，运行设置由经理维护。" showIcon/>}
          {config.data&&<Form key={config.data.version} layout="vertical" disabled={!isManager} initialValues={config.data.settings??{route:'minimax',enabled:runtime.data?.enabled??false,initializeTimeoutMs:30000,requestTimeoutMs:60000,runTimeoutMs:90000,analysisIntervalMs:5000}} onValuesChange={()=>{key.current=crypto.randomUUID();}} onFinish={v=>save.mutate(v)}>
            <div className="dialog-grid">
              <Form.Item name="route" label="模型供应商"><Select options={[{value:'minimax',label:'MiniMax'},{value:'deepseek',label:'DeepSeek'}]}/></Form.Item>
              <Form.Item name="enabled" label="启用模型分析" valuePropName="checked"><Switch/></Form.Item>
            </div>
            <details className="record-card"><summary>高级设置与技术详情</summary>
              <p className="record-meta">当前配置作用于演示租户。通常可保留默认设置。</p>
              <div className="dialog-grid">
                <Form.Item name="modelId" label="模型 ID" extra="留空使用供应商默认值。"><Input/></Form.Item>
                <Form.Item name="baseURL" label="供应商批准地址" extra="留空使用默认值。"><Input placeholder="https://…"/></Form.Item>
                {[['initializeTimeoutMs','初始化超时'],['requestTimeoutMs','单次请求超时'],['runTimeoutMs','总运行超时'],['analysisIntervalMs','分析队列检查间隔']].map(([name,label])=><Form.Item key={name} name={name} label={`${label}（毫秒）`} rules={[{required:true}]}><InputNumber min={1000} max={name==='analysisIntervalMs'?3600000:600000} precision={0}/></Form.Item>)}
              </div>
              <p className="record-meta">总运行超时必须不小于初始化与单次请求超时之和；队列检查间隔与自动巡检周期分别配置。</p>
            </details>
            {save.isError&&<Alert type="error" showIcon title="运行设置保存失败" description={save.error.message}/>}
            {save.isSuccess&&<Alert type="success" showIcon title="运行设置已保存"/>}
            <div className="dialog-actions"><Button type="primary" htmlType="submit" loading={save.isPending}>保存运行设置</Button></div>
          </Form>}
        </PanelSection>},
        {key:'connections',label:'场景连接',children:<div className="dialog-stack">
          <PanelSection title="场景与业务连接" description="连接自研打样模块。连接地址和凭据由服务器统一管理。">
            {installation.isLoading&&<Skeleton active paragraph={{rows:3}}/>}
            {installation.isError&&<Alert type="error" showIcon title="场景连接读取失败" action={<Button onClick={()=>void installation.refetch()}>重试</Button>}/>}
            {installation.data&&<Form key={'binding-'+installation.data.version} layout="vertical" initialValues={{enabled:installation.data.enabled,bindings:installation.data.bindings}} disabled={!isManager} onValuesChange={()=>{bindingKey.current=crypto.randomUUID();}} onFinish={v=>bind.mutate(v)}>
              <Form.Item name="enabled" label="启用声研场景" valuePropName="checked"><Switch/></Form.Item>
              <details className="record-card"><summary>高级连接设置</summary>
                <p className="record-meta">绑定版本 {installation.data.version}（0 表示尚未保存初始绑定）。</p>
                {Object.keys(installation.data.bindings).map(id=><Form.Item key={id} name={['bindings',id]} label={id}><Select options={installation.data.connections.filter((c:any)=>c.capabilities[id]).map((c:any)=>({value:c.id,label:c.label}))}/></Form.Item>)}
              </details>
              {bind.isError&&<Alert type="error" showIcon title="场景连接保存失败" description={bind.error.message}/>}
              {bind.isSuccess&&<Alert type="success" showIcon title="场景连接已保存"/>}
              <div className="dialog-actions"><Button type="primary" htmlType="submit" loading={bind.isPending}>保存场景绑定</Button></div>
            </Form>}
          </PanelSection>
          <PanelSection title="已安装的业务场景" description="展开查看场景包含的业务能力及版本。">
            {capabilities.isLoading&&<Skeleton active paragraph={{rows:2}}/>}
            {capabilities.isError&&<Alert type="error" showIcon title="业务能力读取失败" action={<Button onClick={()=>void capabilities.refetch()}>重试</Button>}/>}
            {capabilities.data?.length===0&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已安装的业务场景"/>}
            {capabilities.data?.map((scene:any)=><details className="record-card" key={scene.id}><summary>{scene.label??scene.name??(scene.id==='soundlab'?'声研打样':scene.id)} · {scene.capabilities.length} 项能力</summary><p className="record-meta">场景编号 {scene.id} · 版本 {scene.version}</p>{scene.capabilities.map((c:any)=><p key={c.id}>{c.label??c.name??c.id} · v{c.version} · {c.effect==='read'?'读取':'写入'}</p>)}</details>)}
          </PanelSection>
        </div>},
        {key:'statistics',label:'运行统计',children:!isManager?<Alert type="info" showIcon title="运行统计仅向经理开放"/>:<div className="dialog-stack">
          {ops.isError&&<Alert type="error" showIcon title="运行统计读取失败" action={<Button onClick={()=>void ops.refetch()}>重试</Button>}/>}
          <PanelSection title="分析任务统计" description="了解分析任务的处理状态和尝试次数。">
            <Table rowKey="status" size="small" loading={ops.isLoading} scroll={{x:'max-content'}} pagination={false} dataSource={ops.data?.tasks??[]} locale={{emptyText:'暂无分析任务'}} columns={[{title:'状态',dataIndex:'status',render:(status:string)=><Tag>{taskLabels[status]??status}</Tag>},{title:'任务数',dataIndex:'count'},{title:'累计尝试',dataIndex:'attempts'}]}/>
            {ops.data?.costNote&&<p className="record-meta">{ops.data.costNote}</p>}
          </PanelSection>
          <PanelSection title="模型使用明细" description="用量以供应商返回的计量信息为准。">
            <Table rowKey="event_id" size="small" loading={ops.isLoading} scroll={{x:'max-content'}} pagination={{pageSize:8}} dataSource={ops.data?.usage??[]} locale={{emptyText:'暂无模型使用记录'}} columns={[{title:'订单',dataIndex:'object_id'},{title:'模型',dataIndex:'model'},{title:'未缓存输入',render:(_:unknown,r:any)=>r.usage.inputTokens},{title:'输出',render:(_:unknown,r:any)=>r.usage.outputTokens},{title:'缓存读取',render:(_:unknown,r:any)=>r.usage.cacheReadTokens??'未提供'},{title:'总量',render:(_:unknown,r:any)=>r.usage.totalTokens??'未提供'},{title:'计量状态',render:(_:unknown,r:any)=>r.usage.partial?'部分计量':'已返回计量'}]}/>
          </PanelSection>
        </div>}
      ]}/>
    </div>
  </BusinessModal>;
}
