import test from 'node:test';import assert from 'node:assert/strict';import Fastify from 'fastify';
import {ticketProvider} from '../packages/adapter-ticket-reference/index.ts';import {CapabilityGateway} from '../apps/zhixing-api/gateway.ts';
test('second independent HTTP schema maps tickets and employee identities without gateway changes',async()=>{
 const app=Fastify();const ticket={ticketId:'ALT-01',revision:4,modelName:'音箱',clientLabel:'测试客户',targetDate:'2026-09-20',stages:[{stageCode:'build',title:'装配',ownerEmployeeCode:'EMP-9',state:'doing',completion:20,dueOn:'2026-09-15',share:1}]};
 app.get('/api/prototype-tickets',async req=>{assert.equal(req.headers['x-integration-key'],'test-key');assert.equal((req.query as any).organization,'demo');return {items:[ticket]};});
 app.post('/api/prototype-tickets/ALT-01/progress',async req=>{const b=req.body as any;assert.equal(req.headers['x-employee'],'EMP-9');assert.equal(b.expectedRevision,4);assert.equal(b.stageCode,'build');return {item:{...ticket,revision:5,stages:[{...ticket.stages[0],completion:50}]}};});
 const url=await app.listen({host:'127.0.0.1',port:0});
 try {
  const provider=ticketProvider(url,'test-key',{zhao:'EMP-9'});const g=new CapabilityGateway();g.bind('demo','sampling.orders.list',provider);g.bind('demo','sampling.feedback.submit',provider);
  const orders=await g.invoke('sampling.orders.list',{}, {tenant:'demo',actor:'zhao'}) as any[];assert.equal(orders[0].id,'ALT-01');assert.equal(orders[0].nodes[0].owner,'zhao');assert.equal(orders[0].nodes[0].status,'in_progress');
  const updated=await g.invoke('sampling.feedback.submit',{id:'ALT-01',nodeId:'build',completed:5,total:10,expectedVersion:4},{tenant:'demo',actor:'zhao'},'feedback-1') as any;assert.equal(updated.version,5);assert.equal(updated.nodes[0].percent,50);
  await assert.rejects(provider.invoke('sampling.node.accept',{}, {tenant:'demo',actor:'zhao'},'accept'),/CAPABILITY_UNAVAILABLE/);
 }finally{await app.close();}
});
