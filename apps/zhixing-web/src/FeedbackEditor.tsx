import {Alert,Button,Form,Input,InputNumber,Modal,Select} from 'antd';
import type {SampleNode} from '../../../packages/sampling-contracts/index.ts';
export function FeedbackEditor({node,pending,onCancel,onSave}:{node:SampleNode;pending:boolean;onCancel:()=>void;onSave:(input:unknown)=>void}){
  const[form]=Form.useForm();const mode=Form.useWatch('mode',form)??'quantity';
  return <Modal title={`提交反馈 · ${node.name}`} open onCancel={onCancel} footer={null}><Form form={form} layout="vertical" initialValues={{mode:'quantity',blocker:''}} onFinish={v=>onSave({...v,...(v.mode==='percent'?{completed:undefined,total:undefined}:{percent:undefined}),expectedFinish:v.expectedFinish||undefined,materialEta:v.materialEta||undefined})}>
    <Form.Item name="mode" label="反馈方式"><Select options={[{value:'quantity',label:'完成数量'},{value:'percent',label:'完成百分比'}]}/></Form.Item>
    {mode==='quantity'?<div className="quantity-grid"><Form.Item name="completed" label="已完成数量" rules={[{required:true}]}><InputNumber min={0} precision={0}/></Form.Item><Form.Item name="total" label="目标数量" rules={[{required:true}]}><InputNumber min={1} precision={0}/></Form.Item></div>:<Form.Item name="percent" label="完成百分比" rules={[{required:true}]}><InputNumber min={0} max={100} precision={0} suffix="%"/></Form.Item>}
    <div className="quantity-grid"><Form.Item name="expectedFinish" label="预计完成日期"><Input type="date"/></Form.Item><Form.Item name="materialEta" label="预计到料日期"><Input type="date"/></Form.Item></div>
    <Form.Item name="blocker" label="阻塞或需要协助的事项"><Input.TextArea maxLength={500} rows={3}/></Form.Item><Alert type="info" title="预计日期是负责人提供的依据，系统会结合依赖和工作日评估交期。"/><Button type="primary" block htmlType="submit" loading={pending}>保存进度反馈</Button>
  </Form></Modal>;
}
