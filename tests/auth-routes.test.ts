import test from 'node:test';import assert from 'node:assert/strict';import Fastify from 'fastify';
import {installAuth} from '../apps/platform-api/auth-routes.ts';
test('session mode rejects demo headers and service token cannot authorize writes',async()=>{
 const app=Fastify();const principal=installAuth(app,{query:async()=>({rows:[{tenant:'demo',actor:'chen',role:'manager',displayName:'陈静',enabled:true,version:1}]})} as any,{demoMode:false,readToken:'local-test-read-token',origin:'http://127.0.0.1:5179'});
 app.get('/api/soundlab/orders',async req=>principal(req.headers));app.post('/api/write',async req=>principal(req.headers));
 try {
  assert.equal((await app.inject({url:'/api/soundlab/orders',headers:{'x-demo-user':'chen'}})).statusCode,401);
  const read=await app.inject({url:'/api/soundlab/orders',headers:{'x-read-token':'local-test-read-token'}});assert.equal(read.statusCode,200);assert.equal(read.json().tenant,'demo');
  assert.equal((await app.inject({method:'POST',url:'/api/write',headers:{'x-read-token':'local-test-read-token',origin:'http://127.0.0.1:5179'}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/login',headers:{origin:'https://other.example'},payload:{}})).statusCode,403);
 }finally{await app.close();}
});

test('demo mode accepts enabled directory members beyond six seed identities',async()=>{const app=Fastify();const principal=installAuth(app,{query:async(_sql:string,args:string[])=>({rows:args[1]==='alice'?[{tenant:'demo',actor:'alice',role:'member',enabled:true}]:[]})} as any,{demoMode:true,readToken:'',origin:'http://127.0.0.1:5179'});app.get('/api/example',async req=>principal(req.headers));try{assert.equal((await app.inject({url:'/api/example',headers:{'x-demo-user':'alice'}})).json().actor,'alice');assert.equal((await app.inject({url:'/api/example',headers:{'x-demo-user':'disabled'}})).statusCode,403);}finally{await app.close();}});
