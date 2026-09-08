import test from 'node:test';import assert from 'node:assert/strict';import {createWebServer} from '../scripts/serve-web.ts';
import Fastify from 'fastify';
test('built web server refuses arbitrary files and path traversal',async()=>{
 const app=createWebServer();try{for(const url of ['/.env','/package.json','/assets/../../.env','/assets/%2e%2e%2f.env'])assert.equal((await app.inject({url})).statusCode,404);}finally{await app.close();}
});
test('built web entry forwards WeCom XML callback unchanged',async()=>{
 const upstream=Fastify();upstream.addContentTypeParser(['application/xml','text/xml'],{parseAs:'string'},(_req,body,done)=>done(null,body));let received='';
 upstream.post('/api/wecom/callback',async req=>{received=req.body as string;return 'success';});await upstream.listen({host:'127.0.0.1',port:0});
 const address=upstream.server.address() as {port:number};const app=createWebServer(undefined,`http://127.0.0.1:${address.port}`);const xml='<xml><Encrypt><![CDATA[encrypted]]></Encrypt></xml>';
 try{const result=await app.inject({method:'POST',url:'/api/wecom/callback?timestamp=1',headers:{'content-type':'application/xml'},payload:xml});assert.equal(result.statusCode,200);assert.equal(result.body,'success');assert.equal(received,xml);}finally{await app.close();await upstream.close();}
});
