import {AsyncLocalStorage} from 'node:async_hooks';
export interface Member {tenant:string;actor:string;displayName:string;role:'manager'|'member';enabled:boolean;version:number}
const directory=new AsyncLocalStorage<{tenant:string;members:Member[]}>();
export function withMembers<T>(tenant:string,members:Member[],fn:()=>T):T{return directory.run({tenant,members},fn);}
export function activeOwner(actor:unknown):boolean {const c=directory.getStore();return !!c&&typeof actor==='string'&&c.members.some(m=>m.tenant===c.tenant&&m.actor===actor&&m.enabled);}
export function isManager(actor:string):boolean {const c=directory.getStore();return !!c&&c.members.some(m=>m.tenant===c.tenant&&m.actor===actor&&m.enabled&&m.role==='manager');}
export function assertManager(actor:string){if(!isManager(actor))throw new Error('FORBIDDEN');}
export function assertIdentity(p:{tenant:string;actor:string}){const c=directory.getStore();if(!c||p?.tenant!==c.tenant||!activeOwner(p.actor))throw new Error('FORBIDDEN');}
