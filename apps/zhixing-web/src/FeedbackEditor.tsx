import {BusinessModal,PanelSection} from './BusinessModal';
import {Alert,Button,Form,Input,InputNumber,Radio} from 'antd';
import type {SampleNode} from '../../../packages/sampling-contracts/index.ts';
export function FeedbackEditor({node,pending,onCancel,onSave}:{node:SampleNode;pending:boolean;onCancel:()=>void;onSave:(input:unknown)=>void}){
  const[form]=Form.useForm();const mode=Form.useWatch('mode',form)??'quantity';
  return <BusinessModal title={`提交反馈 · ${node.name}`} description="更新完成进度，让项目负责人及时了解进展与需要协助的事项。" open width={660} onCancel={onCancel} footer={null}><Form form={form} layout="vertical" initialValues={{mode:'quantity',blocker:''}} onFinish={v=>onSave({...v,...(v.mode==='percent'?{completed:undefined,total:undefined}:{percent:undefined}),expectedFinish:v.expectedFinish||undefined,materialEta:v.materialEta||undefined})}>
    <PanelSection title="本次完成进度" description={`当前节点进度 ${node.percent}% · 计划完成 ${node.due}`}>
    <Form.Item name="mode" label="反馈方式"><Radio.Group optionType="button" buttonStyle="solid" options={[{value:'quantity',label:'按完成数量'},{value:'percent',label:'按百分比'}]}/></Form.Item>
    {mode==='quantity'?<div className="quantity-grid"><Form.Item name="completed" label="已完成数量" rules={[{required:true}]}><InputNumber min={0} precision={0}/></Form.Item><Form.Item name="total" label="目标数量" rules={[{required:true}]}><InputNumber min={1} precision={0}/></Form.Item></div>:<Form.Item name="percent" label="完成百分比" rules={[{required:true}]}><InputNumber min={0} max={100} precision={0} suffix="%"/></Form.Item>}
    </PanelSection><PanelSection title="预计时间与协助" description="选填；有变化或阻塞时补充，方便团队跟进。">
    <div className="quantity-grid"><Form.Item name="expectedFinish" label="预计完成日期"><Input type="date"/></Form.Item><Form.Item name="materialEta" label="预计到料日期"><Input type="date"/></Form.Item></div>
    <Form.Item name="blocker" label="阻塞或需要协助的事项"><Input.TextArea maxLength={500} showCount rows={3} placeholder="例如：缺少检测材料，需要协助确认到料时间"/></Form.Item></PanelSection><Alert type="info" showIcon title="预计日期将用于交期评估" description="系统会结合前置节点和工作日计算，完成 100% 后仍需经理验收。"/><div className="dialog-actions"><Button onClick={onCancel}>取消</Button><Button type="primary" htmlType="submit" loading={pending}>保存进度反馈</Button></div>
  </Form></BusinessModal>;
}
