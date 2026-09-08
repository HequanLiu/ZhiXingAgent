import {soundlabOutput} from './output-contracts.ts';
import type {ScenarioManifest,ValueSchema,CapabilityProvider} from '../platform-contracts/index.ts';
import type {CapabilityGateway} from '../../apps/zhixing-api/gateway.ts';
const str:ValueSchema={type:'string',maxLength:500};const number:ValueSchema={type:'integer',minimum:0};
const object=(properties:Record<string,ValueSchema>,required:string[]=[]):ValueSchema=>({type:'object',properties,required,additionalProperties:false});
const node={id:str,nodeId:str,expectedVersion:{type:'integer',minimum:1} as ValueSchema};
const definitions:[string,'read'|'write',ValueSchema][]=[
 ['sampling.templates.list','read',object({})],
 ['sampling.template.save','write',object({id:str,name:str,expectedVersion:number,project:{type:'object'}},['id','name','project'])],
 ['sampling.template.delete','write',object({id:str,expectedVersion:number},['id','expectedVersion'])],
 ['sampling.projects.batch','write',object({projects:{type:'array',items:{type:'object'}}},['projects'])],
 ['sampling.project.configure','write',object({id:str,expectedVersion:number,calendar:{type:'object'},nodes:{type:'array',items:{type:'object'}}},['id','expectedVersion','calendar','nodes'])],
 ['sampling.attachments.list','read',object({orderId:str},['orderId'])],['sampling.attachment.read','read',object({id:str},['id'])],
 ['sampling.attachment.upload','write',object({orderId:str,nodeId:str,expectedVersion:number,filename:str,mime:str,base64:{type:'string',maxLength:2800000}},['orderId','nodeId','expectedVersion','filename','mime','base64'])],
 ['sampling.orders.list','read',object({})],['sampling.order.create','write',object({id:str,product:str,customer:str,due:str,calendar:{type:'object'},nodes:{type:'array',items:{type:'object'}}},['id','product','customer','due','calendar','nodes'])],
 ['sampling.feedback.submit','write',object({...node,completed:number,total:number,blocker:str,mode:{type:'string',enum:['quantity','percent']},percent:number,expectedFinish:str,materialEta:str},['id','nodeId','expectedVersion'])],
 ['sampling.node.assign','write',object({...node,owner:str},['id','nodeId','owner','expectedVersion'])],
 ...['accept','return'].map(action=>[`sampling.node.${action}`,'write',object({...node,note:str},['id','nodeId','expectedVersion'])] as [string,'write',ValueSchema]),
 ['sampling.changes.list','read',object({})],
 ['sampling.change.propose','write',object({orderId:str,sourceVersion:number,due:str,extraCostCents:number,reason:str},['orderId','sourceVersion','due','extraCostCents','reason'])],
 ['sampling.change.decide','write',object({id:str,decision:{type:'string',enum:['approve','reject']},expectedPlanVersion:number},['id','decision','expectedPlanVersion'])],
 ['sampling.change.apply','write',object({id:str},['id'])],['sampling.invocation.get','read',object({id:str,key:str})]
];
export const soundlabManifest:ScenarioManifest={id:'soundlab-assistant',version:'1.0.0',capabilities:definitions.map(([id,effect,input])=>({id,effect,input,version:'1',output:soundlabOutput(id)}))};
export function installSoundlab(gateway:CapabilityGateway,tenant:string,provider:CapabilityProvider){gateway.install(tenant,soundlabManifest,Object.fromEntries(soundlabManifest.capabilities.map(c=>[c.id,{provider,version:'1'}])));}
