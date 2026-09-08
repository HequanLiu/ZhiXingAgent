import {withMembers,type Member} from '../../packages/member-authorization/index.ts';
export function testMembers(tenant:string):Member[]{return ['chen','wang','li','zhao','zhou','liu'].map(actor=>({tenant,actor,displayName:actor,role:actor==='chen'?'manager':'member',enabled:true,version:1}));}
export function scoped<F extends (...args:any[])=>any>(fn:F,tenant:(args:Parameters<F>)=>string):F{return ((...args:Parameters<F>)=>withMembers(tenant(args),testMembers(tenant(args)),()=>fn(...args))) as F;}
