import type { FastifyInstance } from 'fastify';
import type { CapabilityGateway } from '../../apps/zhixing-api/gateway.ts';
import type { Principal } from '../platform-contracts/index.ts';
export function registerSoundlab(app:FastifyInstance,gateway:CapabilityGateway,principal:(headers:Record<string,unknown>)=>Principal) {
  app.get<{Querystring:{orderId:string}}>('/api/soundlab/attachments',async req=>gateway.invoke('sampling.attachments.list',req.query,principal(req.headers)));
  app.post('/api/soundlab/attachments',{bodyLimit:3*1024*1024},async req=>gateway.invoke('sampling.attachment.upload',req.body,principal(req.headers),String(req.headers['idempotency-key']??'')));
  app.get<{Params:{id:string}}>('/api/soundlab/attachments/:id',async(req,reply)=>{
    const result=await gateway.invoke('sampling.attachment.read',{id:req.params.id},principal(req.headers)) as {metadata:{mime:string;filename:string};base64:string};
    reply.header('content-type',result.metadata.mime).header('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(result.metadata.filename)}`).header('x-content-type-options','nosniff').header('cache-control','private, no-store');return reply.send(Buffer.from(result.base64,'base64'));
  });
  app.get('/api/soundlab/templates',async req=>gateway.invoke('sampling.templates.list',{},principal(req.headers)));
  app.post('/api/soundlab/templates',async req=>gateway.invoke('sampling.template.save',req.body,principal(req.headers),String(req.headers['idempotency-key']??'')));
  app.post<{Params:{id:string};Body:Record<string,unknown>}>('/api/soundlab/templates/:id/delete',async req=>gateway.invoke('sampling.template.delete',{...req.body,id:req.params.id},principal(req.headers),String(req.headers['idempotency-key']??'')));
  app.post('/api/soundlab/orders/batch',async req=>gateway.invoke('sampling.projects.batch',req.body,principal(req.headers),String(req.headers['idempotency-key']??'')));
  app.get('/api/soundlab/orders', async req => gateway.invoke('sampling.orders.list',{},principal(req.headers)));
  app.post<{Params:{id:string};Body:Record<string,unknown>}>('/api/soundlab/orders/:id/configure',async req=>gateway.invoke('sampling.project.configure',{...req.body,id:req.params.id},principal(req.headers),String(req.headers['idempotency-key']??'')));
  app.post('/api/soundlab/orders',async req=>gateway.invoke('sampling.order.create',req.body,principal(req.headers),String(req.headers['idempotency-key']??'')));
  app.get('/api/soundlab/changes',async req=>gateway.invoke('sampling.changes.list',{},principal(req.headers)));
  app.post('/api/soundlab/changes',async req=>gateway.invoke('sampling.change.propose',req.body,principal(req.headers),String(req.headers['idempotency-key']??'')));
  for(const action of ['decide','apply'])app.post<{Params:{id:string};Body:Record<string,unknown>}>(`/api/soundlab/changes/:id/${action}`,async req=>gateway.invoke(`sampling.change.${action}`,{...req.body,id:req.params.id},principal(req.headers),String(req.headers['idempotency-key']??'')));
  app.get<{Querystring:{id?:string;key?:string}}>('/api/soundlab/invocations',async req=>gateway.invoke('sampling.invocation.get',req.query,principal(req.headers)));
  for (const [path,capability] of [['feedback','sampling.feedback.submit'],['assign','sampling.node.assign'],['accept','sampling.node.accept'],['return','sampling.node.return']]) {
    app.post<{Params:{id:string};Body:Record<string,unknown>}>(`/api/soundlab/orders/:id/${path}`,async req => {
      if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') throw new Error('VALIDATION_ERROR');
      return gateway.invoke(capability,{...req.body,id:req.params.id},principal(req.headers),String(req.headers['idempotency-key'] ?? ''));
    });
  }
}
