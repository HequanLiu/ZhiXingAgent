import Fastify from 'fastify';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {Readable} from 'node:stream';
export function createWebServer(root=resolve('dist/web'),apiOrigin='http://127.0.0.1:4310') {
 const app=Fastify({logger:false,bodyLimit:3*1024*1024});
 app.addContentTypeParser(['application/xml','text/xml'],{parseAs:'string',bodyLimit:100000},(_req,body,done)=>done(null,body));
 app.addHook('onSend',async(_req,reply,payload)=>{reply.header('x-content-type-options','nosniff').header('x-frame-options','DENY').header('referrer-policy','same-origin');return payload;});
 app.all('/api/*',async(req,reply)=>{
  const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(!['host','content-length','connection','transfer-encoding'].includes(key)&&typeof value==='string')headers.set(key,value);
  const controller=new AbortController();reply.raw.on('close',()=>controller.abort());
  const response=await fetch(apiOrigin+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body),signal:controller.signal});
  reply.code(response.status);for(const[key,value]of response.headers)if(!['content-length','content-encoding','transfer-encoding','connection','set-cookie'].includes(key))reply.header(key,value);
  const cookies=response.headers.getSetCookie();if(cookies.length)reply.header('set-cookie',cookies);
  return response.body?reply.send(Readable.fromWeb(response.body as any)):reply.send();
 });
 app.get('/*',async(req,reply)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const asset=/^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2|png|svg)$/.exec(path);
  if(!asset&&!['/','/mobile','/index.html'].includes(path))return reply.code(404).send({code:'NOT_FOUND'});
  const file=asset?path.slice(1):'index.html';const mime:Record<string,string>={js:'text/javascript',css:'text/css',woff2:'font/woff2',png:'image/png',svg:'image/svg+xml',html:'text/html'};
  try{const bytes=await readFile(resolve(root,file));reply.header('content-type',mime[file.split('.').at(-1)!]).header('cache-control',asset?'public, max-age=31536000, immutable':'no-store');return reply.send(bytes);}catch{return reply.code(404).send({code:'NOT_FOUND'});}
 });return app;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/scripts/serve-web.ts')){
 const app=createWebServer();await app.listen({host:process.env.SOUNDLAB_WEB_HOST??'127.0.0.1',port:5179});console.log('Built web application ready on port 5179');
 for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{await app.close();process.exit(0);});
}
