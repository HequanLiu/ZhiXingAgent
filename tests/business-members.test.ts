import test from 'node:test';import assert from 'node:assert/strict';import Fastify from 'fastify';
import {installBusinessAuthorization} from '../apps/soundlab-api/authorization.ts';
import {newProject} from '../apps/soundlab-api/project.ts';
import {applyFeedback,acceptNode} from '../apps/soundlab-api/domain.ts';
import type {Order} from '../packages/sampling-contracts/index.ts';
test('HTTP bridge resolves real dynamic members, preserves feedback and acceptance actors, and rejects forged role and read-service writes',async()=>{
 const app=Fastify();let members=[{tenant:'acme',actor:'mgr-22',role:'manager',enabled:true},{tenant:'acme',actor:'worker-83',role:'member',enabled:true}];let order:Order;
 installBusinessAuthorization(app,'local-test-bridge',async(_url,init)=>{assert.equal((init?.headers as any)['x-tenant'],'acme');return new Response(JSON.stringify(members));});
 app.setErrorHandler((e,_req,reply)=>reply.code(403).send({code:(e as Error).message}));
 app.post('/orders',async req=>order=newProject({id:'REAL',product:'speaker',customer:'customer',due:'2026-09-30',calendar:{weekdays:[1],holidays:[]},nodes:[{id:'assembly',name:'装配',owner:'worker-83',due:'2026-09-30',weight:1,dependencies:[],durationDays:1,acceptanceCriteria:'检查通过'}]},'acme',String(req.headers['x-actor'])));
 app.post('/feedback',async req=>order=applyFeedback(order,{nodeId:'assembly',expectedVersion:order.version,mode:'percent',percent:100},String(req.headers['x-actor'])));
 app.post('/accept',async req=>order=acceptNode(order,{nodeId:'assembly',expectedVersion:order.version},String(req.headers['x-actor'])));
 app.get('/orders',async()=>[]);
 const call=(url:string,actor:string,extra={})=>app.inject({method:'POST',url,headers:{authorization:'Bearer local-test-bridge','x-tenant':'acme','x-actor':actor,...extra}});
 try{assert.equal((await call('/orders','mgr-22')).statusCode,200);assert.equal((await call('/feedback','worker-83')).statusCode,200);assert.equal(order!.feedback[0].actor,'worker-83');assert.equal((await call('/accept','worker-83',{'x-role':'manager'})).statusCode,403);assert.equal((await call('/accept','service-reader')).statusCode,403);assert.equal((await call('/accept','mgr-22')).statusCode,200);assert.equal(order!.nodes[0].acceptance?.actor,'mgr-22');members=members.map(m=>({...m,enabled:false}));assert.equal((await call('/orders','mgr-22')).statusCode,403);assert.equal((await app.inject({url:'/orders',headers:{authorization:'Bearer local-test-bridge','x-tenant':'acme','x-actor':'service-reader'}})).statusCode,200);}finally{await app.close();}
});
