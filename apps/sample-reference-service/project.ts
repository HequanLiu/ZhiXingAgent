import {assertManager,assertIdentity,activeOwner,isManager} from '../../packages/member-authorization/index.ts';
import {type Order,type SampleNode,type WorkCalendar,type NodeConfiguration,type ProjectConfigurationInput,type ProjectConfigurationSnapshot} from '../../packages/sampling-contracts/index.ts';
import {validDate,validateProject,previewProjectBatch,type ProjectInput} from '../../packages/sampling-contracts/project-validation.ts';
export {validDate,validateProject,previewProjectBatch};
export type {ProjectInput};
export function newProject(value:unknown,tenant:string,actor:string):Order {
  assertIdentity({tenant,actor});assertManager(actor);validateProject(value);if(value.nodes.some(n=>!activeOwner(n.owner)))throw new Error('VALIDATION_ERROR');
  // Explicit projection prevents imported state, acceptance and tenant fields from being trusted.
  return {id:value.id,tenant,product:value.product.trim(),customer:value.customer.trim(),due:value.due,version:1,risk:'normal',forecast:null,feedback:[],calendar:structuredClone(value.calendar),nodes:value.nodes.map(n=>({id:n.id,name:n.name.trim(),owner:n.owner,due:n.due,weight:n.weight,dependencies:[...n.dependencies!],durationDays:n.durationDays,...(n.plannedStart?{plannedStart:n.plannedStart}:{}),acceptanceCriteria:n.acceptanceCriteria!.trim(),percent:0,status:'not_started'}))};
}
const configurationFields=['id','name','owner','due','weight','dependencies','durationDays','plannedStart','acceptanceCriteria'] as const;
function nodeConfiguration(node:SampleNode):NodeConfiguration {
  return Object.fromEntries(configurationFields.filter(key=>node[key]!==undefined).map(key=>[key,structuredClone(node[key])])) as unknown as NodeConfiguration;
}
function configurationSnapshot(order:Order):ProjectConfigurationSnapshot {
  return {...(order.calendar?{calendar:structuredClone(order.calendar)}:{}),nodes:order.nodes.map(nodeConfiguration)};
}
export function configureProject(order:Order,value:unknown,actor:string):Order {
  assertIdentity({tenant:order.tenant,actor});assertManager(actor);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['expectedVersion','calendar','nodes'].includes(key)))throw new Error('VALIDATION_ERROR');
  const input=value as ProjectConfigurationInput;
  if(!Number.isInteger(input.expectedVersion))throw new Error('VALIDATION_ERROR');
  if(input.expectedVersion!==order.version)throw new Error('VERSION_CONFLICT');
  if(!Array.isArray(input.nodes)||input.nodes.some(node=>!node||typeof node!=='object'||Array.isArray(node)||Object.keys(node).some(key=>!configurationFields.includes(key as typeof configurationFields[number]))))throw new Error('VALIDATION_ERROR');
  validateProject({...order,calendar:input.calendar,nodes:input.nodes});if(input.nodes.some(n=>!activeOwner(n.owner)))throw new Error('VALIDATION_ERROR');
  const currentIds=new Set(order.nodes.map(node=>node.id));
  if(input.nodes.length!==currentIds.size||input.nodes.some(node=>!currentIds.has(node.id)))throw new Error('VALIDATION_ERROR');
  const copy=structuredClone(order);
  copy.calendar=structuredClone(input.calendar);
  copy.nodes=copy.nodes.map(node=>{
    const configuration=input.nodes.find(value=>value.id===node.id)!;
    // Remove optional old configuration so an omitted plannedStart can be cleared.
    delete node.plannedStart;
    return {...node,...nodeConfiguration(configuration as SampleNode),name:configuration.name.trim(),acceptanceCriteria:configuration.acceptanceCriteria.trim()};
  });
  copy.configurationHistory=[...(copy.configurationHistory??[]),{actor,at:new Date().toISOString(),sourceVersion:order.version,before:configurationSnapshot(order),after:configurationSnapshot(copy)}];
  copy.version++;
  delete copy.schedule;copy.forecast=null;
  return copy;
}

export interface ProjectTemplate {id:string;name:string;version:number;project:ProjectInput}
export function projectConfiguration(value:unknown):ProjectInput {
 validateProject(value);if(value.nodes.some(n=>!activeOwner(n.owner)))throw new Error('VALIDATION_ERROR');
 return {id:value.id,product:value.product.trim(),customer:value.customer.trim(),due:value.due,calendar:structuredClone(value.calendar),nodes:value.nodes.map(n=>nodeConfiguration(n) as SampleNode)};
}
