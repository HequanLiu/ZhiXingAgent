import {resolveMember} from './members.ts';
import type {FastifyInstance} from 'fastify';import type {Pool} from 'pg';
import type {Principal} from '../../packages/platform-contracts/index.ts';
import {login,authenticate,logout,sessionToken} from './auth.ts';
export function installAuth(app:FastifyInstance,db:Pool,options:{demoMode:boolean;readToken:string;origin:string}) {
 const identities=new WeakMap<object,Principal>();const attempts=new Map<string,{count:number;until:number}>();
 const cookie=(token:string,age:number)=>`soundlab_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${options.origin.startsWith('https:')?'; Secure':''}`;
 const principal=(headers:Record<string,unknown>):Principal=>{const p=identities.get(headers);if(!p)throw new Error('UNAUTHORIZED');return p;};
 app.addHook('preHandler',async(req,reply)=>{
  if(['/api/channel/feedback','/api/wecom/callback','/internal/members','/internal/chat-orders'].includes(req.url.split('?')[0]))return;
  if(!options.demoMode&&!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==options.origin)return reply.code(403).send({code:'FORBIDDEN'});
  const path=req.url.split('?')[0];if(['/health','/health/ready','/api/login','/api/session'].includes(path))return;
  if(options.readToken&&req.headers['x-read-token']===options.readToken&&req.method==='GET'&&path==='/api/soundlab/orders'){identities.set(req.headers,{tenant:'demo',actor:'service-reader'});return;}
  if(options.demoMode){const actor=String(req.headers['x-demo-user']??(['/api/events','/api/runtime'].includes(path)?'chen':''));if(actor){try{identities.set(req.headers,await resolveMember(db,{tenant:'demo',actor}));return;}catch{return reply.code(403).send({code:'FORBIDDEN'});}}return reply.code(403).send({code:'FORBIDDEN'});}
  try{identities.set(req.headers,await authenticate(db,sessionToken(req.headers.cookie)));}catch{return reply.code(401).send({code:'UNAUTHORIZED'});}
 });
 app.get('/api/session',async req=>{
  if(options.demoMode)return {demo:true,authenticated:false};
  try{return {demo:false,authenticated:true,principal:await authenticate(db,sessionToken(req.headers.cookie))};}catch{return {demo:false,authenticated:false};}
 });
 app.post<{Body:{tenant:string;username:string;password:string}}>('/api/login',async(req,reply)=>{
  const now=Date.now();for(const[key,v]of attempts)if(v.until<=now)attempts.delete(key);
  const state=attempts.get(req.ip)??{count:0,until:now+15*60000};if(state.count>=5||attempts.size>=10000)return reply.code(429).send({code:'RATE_LIMITED'});
  state.count++;attempts.set(req.ip,state);
  try{const result=await login(db,req.body);attempts.delete(req.ip);reply.header('set-cookie',cookie(result.token,43200));return {principal:result.principal};}catch{return reply.code(401).send({code:'UNAUTHORIZED'});}
 });
 app.post('/api/logout',async(req,reply)=>{await logout(db,sessionToken(req.headers.cookie));reply.header('set-cookie',cookie('',0));return {ok:true};});
 return principal;
}
