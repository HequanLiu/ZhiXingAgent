import type {SampleNode,WorkCalendar} from './index.ts';
export function validDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
const text=(v:unknown,max:number)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export interface ProjectInput {id:string;product:string;customer:string;due:string;calendar:WorkCalendar;nodes:SampleNode[]}
export function validateProject(value:unknown):asserts value is ProjectInput {
  const p=value as ProjectInput;
  const invalid=()=>{throw new Error('VALIDATION_ERROR');};
  if(!p||!text(p.id,60)||!/^[\w-]+$/.test(p.id)||!text(p.product,120)||!text(p.customer,120)||!validDate(p.due))invalid();
  if(!p.calendar||!Array.isArray(p.calendar.weekdays)||!p.calendar.weekdays.length||p.calendar.weekdays.length>7||new Set(p.calendar.weekdays).size!==p.calendar.weekdays.length||p.calendar.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||!Array.isArray(p.calendar.holidays)||p.calendar.holidays.length>366||p.calendar.holidays.some(d=>!validDate(d)))invalid();
  if(!Array.isArray(p.nodes)||!p.nodes.length||p.nodes.length>50)invalid();
  const ids=new Set(p.nodes.map(n=>n?.id));if(ids.size!==p.nodes.length)invalid();
  for(const n of p.nodes){
    if(!n||!text(n.id,60)||!/^[\w-]+$/.test(n.id)||!text(n.name,100)||!text(n.owner,60)||!/^[\w-]+$/.test(n.owner)||!validDate(n.due)||!Number.isFinite(n.weight)||n.weight<=0||n.weight>1||!Number.isInteger(n.durationDays)||n.durationDays!<1||n.durationDays!>365||!text(n.acceptanceCriteria,500)||!Array.isArray(n.dependencies)||new Set(n.dependencies).size!==n.dependencies.length||n.dependencies.some(id=>!ids.has(id)||id===n.id)||n.plannedStart!==undefined&&(!validDate(n.plannedStart)||n.plannedStart>n.due))invalid();
  }
  if(Math.abs(p.nodes.reduce((sum,n)=>sum+n.weight,0)-1)>0.000001)invalid();
  const visiting=new Set<string>(),done=new Set<string>();
  function visit(id:string){if(visiting.has(id))invalid();if(done.has(id))return;visiting.add(id);for(const dep of p.nodes.find(n=>n.id===id)!.dependencies!)visit(dep);visiting.delete(id);done.add(id);}
  for(const n of p.nodes)visit(n.id);
}
export function previewProjectBatch(value:unknown,existingOrderIds:readonly string[]=[]):{valid:boolean;errors:{row:number;code:string}[]} {
 if(!Array.isArray(value)||!value.length||value.length>50)return {valid:false,errors:[{row:0,code:'最多导入 50 个项目，且不能为空'}]};
 const errors:{row:number;code:string}[]=[];const ids=new Set<string>();const existing=new Set(existingOrderIds);
 value.forEach((p,index)=>{try{validateProject(p);if(ids.has(p.id))throw new Error('重复项目编号');ids.add(p.id);if(existing.has(p.id))errors.push({row:index+1,code:`项目编号 ${p.id} 已存在，请修改后重新预览`});}catch{errors.push({row:index+1,code:'项目字段、日期、节点依赖或编号不合法'});}});
 return {valid:!errors.length,errors};
}
