import test from 'node:test';import assert from 'node:assert/strict';
import {CapabilityGateway} from '../apps/zhixing-api/gateway.ts';
test('capability manifests validate input and reject missing or incompatible bindings atomically',async()=>{
 const g=new CapabilityGateway();let calls=0;const provider={invoke:async()=>{calls++;return {ok:true};}};
 const manifest={id:'test-scene',version:'1',capabilities:[{id:'thing.update',version:'1',effect:'write' as const,input:{type:'object' as const,properties:{id:{type:'string' as const},expectedVersion:{type:'integer' as const}},required:['id','expectedVersion'],additionalProperties:false}}]};
 assert.throws(()=>g.install('tenant',manifest,{}),/CAPABILITY_UNAVAILABLE/);
 assert.throws(()=>g.install('tenant',manifest,{'thing.update':{provider,version:'2'}}),/CAPABILITY_VERSION_MISMATCH/);
 g.install('tenant',manifest,{'thing.update':{provider,version:'1'}});
 await assert.rejects(g.invoke('thing.update',{id:'x'}, {tenant:'tenant',actor:'chen'},'key'),/VALIDATION_ERROR/);
 await assert.rejects(g.invoke('thing.update',{id:'x',expectedVersion:1,hidden:true},{tenant:'tenant',actor:'chen'},'key'),/VALIDATION_ERROR/);
 await assert.rejects(g.invoke('thing.update',{id:'x',expectedVersion:1},{tenant:'tenant',actor:'chen'}),/IDEMPOTENCY_REQUIRED/);
 const result=await g.invokeEnvelope('thing.update',{id:'x',expectedVersion:1},{tenant:'tenant',actor:'chen'},'key');
 assert.equal(result.status,'succeeded');assert.equal(result.capabilityVersion,'1');assert.ok(result.requestId);assert.equal(calls,1);
});
