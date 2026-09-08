import {useMembers} from './Members';
import {useRef} from 'react';import {Alert,Button,Form,Input,InputNumber,Modal,Select,Switch,Table} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
export function RuntimePanel({actor,tenant,api,onClose}:{actor:string;tenant:string;api:(path:string,body?:unknown,key?:string)=>Promise<any>;onClose:()=>void}){
 const {people,ownerOptions,isManager}=useMembers();
 const client=useQueryClient();const key=useRef(crypto.randomUUID());
 const config=useQuery({queryKey:['runtime-settings',tenant,actor],queryFn:()=>api('/api/settings/runtime')});
 const runtime=useQuery({queryKey:['runtime'],queryFn:()=>api('/api/runtime'),refetchInterval:5000});
 const ops=useQuery({queryKey:['operations',tenant,actor],queryFn:()=>api('/api/operations'),enabled:isManager,refetchInterval:5000});
 const capabilities=useQuery({queryKey:['capabilities',tenant,actor],queryFn:()=>api('/api/capabilities')});
 const installation=useQuery({queryKey:['installations',tenant,actor],queryFn:()=>api('/api/installations')});
 const bindingKey=useRef(crypto.randomUUID());
 const bind=useMutation({mutationFn:(v:any)=>api('/api/installations',{...v,expectedVersion:installation.data.version},bindingKey.current),onSuccess:()=>{bindingKey.current=crypto.randomUUID();void client.invalidateQueries({queryKey:['installations']});}});
 const save=useMutation({mutationFn:(values:any)=>{const{modelId,baseURL,...rest}=values;return api('/api/settings/runtime',{expectedVersion:config.data.version,settings:{...rest,...(modelId?{modelId}:{}),...(baseURL?{baseURL}: {})}},key.current);},onSuccess:()=>{key.current=crypto.randomUUID();void client.invalidateQueries({queryKey:['runtime-settings']});}});
 return <Modal title="运行设置与平台管理" open width={950} onCancel={onClose} footer={null}>
  <Alert type="info" title={runtime.data?.mode??'正在读取运行状态'} description="设置在当前分析结束后生效。模型密钥由服务器环境提供，页面不读取或保存密钥。当前配置作用于演示租户。"/>
  {config.isError&&<Alert type="error" title="当前身份无法读取模型设置"/>}
  {config.data&&<Form key={config.data.version} layout="vertical" disabled={!isManager} initialValues={config.data.settings??{route:'minimax',enabled:runtime.data?.enabled??false,initializeTimeoutMs:30000,requestTimeoutMs:60000,runTimeoutMs:90000,analysisIntervalMs:5000}} onValuesChange={()=>{key.current=crypto.randomUUID();}} onFinish={v=>save.mutate(v)}>
   <div className="quantity-grid"><Form.Item name="route" label="模型供应商"><Select options={[{value:'minimax',label:'MiniMax'},{value:'deepseek',label:'DeepSeek'}]}/></Form.Item><Form.Item name="enabled" label="启用模型分析" valuePropName="checked"><Switch/></Form.Item><Form.Item name="modelId" label="模型 ID（留空使用供应商默认值）"><Input/></Form.Item><Form.Item name="baseURL" label="供应商批准地址（留空使用默认值）"><Input placeholder="https://…"/></Form.Item>{[['initializeTimeoutMs','初始化超时'],['requestTimeoutMs','单次请求超时'],['runTimeoutMs','总运行超时'],['analysisIntervalMs','分析队列检查间隔']].map(([name,label])=><Form.Item key={name} name={name} label={`${label}（毫秒）`} rules={[{required:true}]}><InputNumber min={1000} max={name==='analysisIntervalMs'?3600000:600000} precision={0}/></Form.Item>)}</div><p>总运行超时必须不小于初始化与单次请求超时之和；队列检查间隔与自动巡检周期分别配置。</p>{save.isError&&<Alert type="error" title={save.error.message}/>}<Button type="primary" htmlType="submit" loading={save.isPending}>保存运行设置</Button>
  </Form>}
  {ops.data?.health?.alerts?.map((a:any)=><Alert key={a.code} type={a.severity==='error'?'error':'warning'} title={a.message}/>)}
  <h3>场景与业务连接</h3>
  {installation.data&&<Form key={'binding-'+installation.data.version} layout="vertical" initialValues={{enabled:installation.data.enabled,bindings:installation.data.bindings}} disabled={!isManager} onValuesChange={()=>{bindingKey.current=crypto.randomUUID();}} onFinish={v=>bind.mutate(v)}>
   <p>当前接入自研打样模块，使用同一能力契约。连接地址及凭据由服务端管理。版本 {installation.data.version}（0 表示尚未保存初始绑定）。</p>
   <Form.Item name="enabled" label="启用声研场景" valuePropName="checked"><Switch/></Form.Item>
   <details><summary>逐项能力绑定</summary>{Object.keys(installation.data.bindings).map(id=><Form.Item key={id} name={['bindings',id]} label={id}><Select options={installation.data.connections.filter((c:any)=>c.capabilities[id]).map((c:any)=>({value:c.id,label:c.label}))}/></Form.Item>)}</details>
   <Button htmlType="submit" loading={bind.isPending}>保存场景绑定</Button>{bind.isError&&<Alert type="error" title={bind.error.message}/>}
  </Form>}
  <h3>已安装场景及业务能力</h3>{capabilities.data?.map((scene:any)=><details key={scene.id}><summary>{scene.id} · {scene.version} · {scene.capabilities.length} 项能力</summary>{scene.capabilities.map((c:any)=><p key={c.id}>{c.id} · v{c.version} · {c.effect==='read'?'读取':'写入'}</p>)}</details>)}
  <h3>分析任务统计</h3><Table rowKey="status" size="small" pagination={false} dataSource={ops.data?.tasks??[]} columns={[{title:'状态',dataIndex:'status'},{title:'任务数',dataIndex:'count'},{title:'累计尝试',dataIndex:'attempts'}]}/><p>{ops.data?.costNote}</p>
  <Table rowKey="event_id" size="small" pagination={false} dataSource={ops.data?.usage??[]} columns={[{title:'订单',dataIndex:'object_id'},{title:'模型',dataIndex:'model'},{title:'未缓存输入',render:(_:unknown,r:any)=>r.usage.inputTokens},{title:'输出',render:(_:unknown,r:any)=>r.usage.outputTokens},{title:'缓存读取',render:(_:unknown,r:any)=>r.usage.cacheReadTokens??'未提供'},{title:'总量',render:(_:unknown,r:any)=>r.usage.totalTokens??'未提供'},{title:'完整性',render:(_:unknown,r:any)=>r.usage.partial?'部分计量':'已返回计量'}]}/>
 </Modal>;
}
