import type {ValueSchema} from '../platform-contracts/index.ts';
const s:ValueSchema={type:'string',maxLength:1000},n:ValueSchema={type:'integer',minimum:0};
const object=(properties:Record<string,ValueSchema>,required=Object.keys(properties)):ValueSchema=>({type:'object',properties,required});
const array=(items:ValueSchema):ValueSchema=>({type:'array',items});
const node=object({id:s,name:s,owner:s,status:{type:'string',enum:['not_started','in_progress','blocked','reported_complete','accepted','rework']},percent:{type:'number',minimum:0},weight:{type:'number',minimum:0},due:s});
const order=object({id:s,tenant:s,version:{type:'integer',minimum:1},product:s,customer:s,due:s,nodes:array(node)});
const plan=object({id:s,tenant:s,orderId:s,sourceVersion:{type:'integer',minimum:1},planVersion:{type:'integer',minimum:1},due:s,extraCostCents:n,status:{type:'string',enum:['proposed','approved','rejected','applied']}});
const receipt=object({id:s,changeId:s,status:{type:'string',enum:['completed']},result:order});
const metadata=object({id:s,tenant:s,orderId:s,nodeId:s,sourceVersion:{type:'integer',minimum:1},filename:s,mime:{type:'string',enum:['image/png','image/jpeg','application/pdf']},size:{type:'integer',minimum:1},sha256:s,uploadedAt:s});
const template=object({id:s,name:s,version:{type:'integer',minimum:1},project:object({calendar:{type:'object'},nodes:array({type:'object'})})});
export function soundlabOutput(id:string):ValueSchema{
 const specific:Record<string,ValueSchema>={
  'sampling.orders.list':array(order),'sampling.projects.batch':object({orders:array(order)}),
  'sampling.templates.list':array(template),'sampling.template.save':template,'sampling.template.delete':object({deleted:{type:'boolean',enum:[true]}}),
  'sampling.attachments.list':array(metadata),'sampling.attachment.upload':metadata,'sampling.attachment.read':object({metadata,base64:{type:'string',maxLength:2800000}}),
  'sampling.changes.list':array(plan),'sampling.change.propose':plan,'sampling.change.decide':plan,'sampling.change.apply':receipt,'sampling.invocation.get':receipt
 };return specific[id]??order;
}
