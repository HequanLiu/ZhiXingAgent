import type {Order,ScheduleEvaluation} from '../../packages/sampling-contracts/index.ts';
import {validDate} from './project.ts';
const nextDay=(date:string)=>new Date(new Date(date+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);
export function evaluateSchedule(order:Order,asOf:string):ScheduleEvaluation {
  if(!validDate(asOf))throw new Error('VALIDATION_ERROR');
  const result:ScheduleEvaluation={forecast:null,risk:'normal',asOf,sourceVersion:order.version,missing:[],nodes:[]};
  const calendar=order.calendar;
  const working=(date:string)=>!!calendar?.weekdays.includes(new Date(date+'T00:00:00Z').getUTCDay())&&!calendar.holidays.includes(date);
  function workday(date:string){for(let i=0;i<3660;i++,date=nextDay(date))if(working(date))return date;throw new Error('VALIDATION_ERROR');}
  const done=new Map<string,string|null>(),visiting=new Set<string>();
  function finish(id:string):string|null {
    if(done.has(id))return done.get(id)!;
    const n=order.nodes.find(node=>node.id===id);if(!n||visiting.has(id))throw new Error('VALIDATION_ERROR');
    visiting.add(id);let start:string|null=null,end:string|null=null,basis='待核实';
    if(n.status==='accepted'){
      const at=n.acceptance?.at;const timestamp=at?new Date(at):null;
      if(timestamp&&Number.isFinite(timestamp.getTime())){
        end=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(timestamp);
        basis='实际验收日期（上海时间）';
      }else {basis='已验收，历史完成日期待核实；后续可从评估日启动';result.missing.push(`${n.name}：缺少历史验收时间`);}
    }
    else if(!calendar?.weekdays.length||!n.dependencies||!Number.isInteger(n.durationDays)||n.durationDays!<=0){result.missing.push(`${n.name}：缺少工期、依赖或工作日历`);}
    else {
      const ends=n.dependencies.map(finish);
      if(ends.some((d,i)=>d===null&&order.nodes.find(node=>node.id===n.dependencies![i])?.status!=='accepted')){result.missing.push(`${n.name}：前置节点预计完成时间待核实`);}
      else if(n.status==='blocked'&&!validDate(n.expectedFinish)){result.missing.push(`${n.name}：阻塞恢复及预计完成时间待核实`);}
      else if(n.status==='reported_complete'){result.missing.push(`${n.name}：等待验收，验收完成时间待核实`);}
      else {
        const pendingDeps=n.dependencies.filter(dep=>order.nodes.find(x=>x.id===dep)?.status!=='accepted');
        const boundaries=[asOf,...pendingDeps.map(dep=>nextDay(done.get(dep)!)),...(n.plannedStart?[n.plannedStart]:[]),...(n.materialEta?[n.materialEta]:[])];
        start=workday(boundaries.sort().at(-1)!);
        let remaining=Math.max(1,Math.ceil(n.durationDays!*(100-n.percent)/100));end=start;
        while(--remaining>0)end=workday(nextDay(end));
        if(validDate(n.expectedFinish))end=workday([end,n.expectedFinish].sort().at(-1)!);
        basis=validDate(n.expectedFinish)?'依赖及工作日历计算，与负责人预计完成日期取较晚值':'按剩余比例折算工期、前置依赖和工作日历计算';
      }
    }
    visiting.delete(id);done.set(id,end);result.nodes.push({nodeId:id,start,finish:end,basis});return end;
  }
  const ends=order.nodes.map(n=>finish(n.id));
  const unfinished=order.nodes.filter(n=>n.status!=='accepted');
  const forecastKnown=unfinished.length?unfinished.every(n=>done.get(n.id)!==null):ends.every(Boolean);
  result.forecast=forecastKnown?(ends.filter((date):date is string=>date!==null)).sort().at(-1)??null:null;
  const confirmedLate=result.nodes.some(n=>n.finish!==null&&n.finish>order.due);
  result.risk=confirmedLate?'risk':result.missing.length?'attention':'normal';return result;
}
