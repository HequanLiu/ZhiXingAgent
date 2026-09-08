import type { CapabilityProvider, Principal } from '../platform-contracts/index.ts';
export function referenceProvider(baseURL: string, bridgeKey: string): CapabilityProvider {
  return { async invoke(capability, input, principal: Principal, key) {
    const value = input as { id?: string; [key:string]:unknown };
    if(capability==='sampling.project.configure'){
      const{id,...body}=value;const response=await fetch(baseURL+'/orders/'+encodeURIComponent(id??'')+'/configure',{method:'POST',headers:{authorization:`Bearer ${bridgeKey}`,'content-type':'application/json','x-tenant':principal.tenant,'x-actor':principal.actor,'idempotency-key':key??''},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
      const data=await response.json() as {code?:string};if(!response.ok)throw new Error(data.code??'PROVIDER_ERROR');return data;
    }
    if(['sampling.attachments.list','sampling.attachment.upload','sampling.attachment.read'].includes(capability)) {
      const write=capability==='sampling.attachment.upload';const path=write?'/attachments':capability==='sampling.attachments.list'?'/attachments?orderId='+encodeURIComponent(String(value.orderId??'')):'/attachments/'+encodeURIComponent(value.id??'');
      const response=await fetch(baseURL+path,{method:write?'POST':'GET',headers:{authorization:`Bearer ${bridgeKey}`,'content-type':'application/json','x-tenant':principal.tenant,'x-actor':principal.actor,'idempotency-key':key??''},body:write?JSON.stringify(input):undefined,signal:AbortSignal.timeout(10000)});
      const data=await response.json() as {code?:string};if(!response.ok)throw new Error(data.code??'PROVIDER_ERROR');return data;
    }
    const changeRoutes:Record<string,{path:string;method:string}>={
      'sampling.templates.list':{path:'/templates',method:'GET'},'sampling.template.save':{path:'/templates',method:'POST'},
      'sampling.template.delete':{path:`/templates/${encodeURIComponent(value.id??'')}/delete`,method:'POST'},
      'sampling.projects.batch':{path:'/orders/batch',method:'POST'},
      'sampling.changes.list':{path:'/changes',method:'GET'},'sampling.change.propose':{path:'/changes',method:'POST'},
      'sampling.change.decide':{path:`/changes/${encodeURIComponent(value.id??'')}/decide`,method:'POST'},
      'sampling.change.apply':{path:`/changes/${encodeURIComponent(value.id??'')}/apply`,method:'POST'},
      'sampling.invocation.get':{path:`/invocations?${value.id?'id='+encodeURIComponent(value.id):'key='+encodeURIComponent(String(value.key??''))}`,method:'GET'}
    };
    if(Object.hasOwn(changeRoutes,capability)){
      const route=changeRoutes[capability];const response=await fetch(baseURL+route.path,{method:route.method,headers:{authorization:`Bearer ${bridgeKey}`,'content-type':'application/json','x-tenant':principal.tenant,'x-actor':principal.actor,'idempotency-key':key??''},body:route.method==='POST'?JSON.stringify(input):undefined,signal:AbortSignal.timeout(5000)});
      const data=await response.json() as {code?:string};if(!response.ok)throw new Error(data.code??'PROVIDER_ERROR');return data;
    }
    if(capability==='sampling.order.create') {
      const response=await fetch(baseURL+'/orders',{method:'POST',headers:{authorization:`Bearer ${bridgeKey}`,'content-type':'application/json','x-tenant':principal.tenant,'x-actor':principal.actor,'idempotency-key':key??''},body:JSON.stringify(input),signal:AbortSignal.timeout(5000)});
      const data=await response.json() as {code?:string};if(!response.ok)throw new Error(data.code??'PROVIDER_ERROR');return data;
    }
    const routes: Record<string,string> = { 'sampling.node.accept':`/orders/${encodeURIComponent(value.id ?? '')}/accept`,'sampling.node.return':`/orders/${encodeURIComponent(value.id ?? '')}/return`,'sampling.orders.list':'/orders','sampling.feedback.submit':`/orders/${encodeURIComponent(value.id ?? '')}/feedback`,'sampling.node.assign':`/orders/${encodeURIComponent(value.id ?? '')}/assign` };
    if (!Object.hasOwn(routes,capability)) throw new Error('CAPABILITY_UNAVAILABLE');
    const response = await fetch(baseURL+routes[capability], { method:capability==='sampling.orders.list'?'GET':'POST', headers:{authorization:`Bearer ${bridgeKey}`,'content-type':'application/json','x-tenant':principal.tenant,'x-actor':principal.actor,'idempotency-key':key??''}, body:capability==='sampling.orders.list'?undefined:JSON.stringify(value), signal:AbortSignal.timeout(5000) });
    const data = await response.json() as {code?:string};
    if (!response.ok) throw new Error(data.code ?? 'PROVIDER_ERROR');
    return data;
  } };
}
