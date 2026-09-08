import type {FastifyInstance} from 'fastify';
import {withMembers,type Member} from '../../packages/member-authorization/index.ts';
export function installBusinessAuthorization(app:FastifyInstance,bridgeKey:string,transport:typeof fetch=fetch){
app.addHook('onRoute',route=>{if(route.url==='/health')return;const handler=route.handler;route.handler=async function(req,reply){
 const tenant=String(req.headers['x-tenant']??''),actor=String(req.headers['x-actor']??'');
 if(req.headers.authorization!==`Bearer ${bridgeKey}`||!(/^[\w-]{1,60}$/.test(tenant)))throw new Error('FORBIDDEN');
 if(actor==='service-reader'){if(req.method!=='GET'||!['/orders','/events'].includes(req.url.split('?')[0]))throw new Error('FORBIDDEN');return handler.call(this,req,reply);}
 const response=await transport('http://127.0.0.1:4310/internal/members',{headers:{authorization:`Bearer ${bridgeKey}`,'x-tenant':tenant},signal:AbortSignal.timeout(3000)});
 if(!response.ok)throw new Error('FORBIDDEN');const members=await response.json() as Member[];
 if(!Array.isArray(members)||!members.some(m=>m.tenant===tenant&&m.actor===actor&&m.enabled))throw new Error('FORBIDDEN');
 return withMembers(tenant,members,()=>handler.call(this,req,reply));
};});
}
