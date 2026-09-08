import test from 'node:test';import assert from 'node:assert/strict';
import {CapabilityGateway} from '../apps/zhixing-api/gateway.ts';import {soundlabManifest,installSoundlab} from '../packages/scenario-soundlab/manifest.ts';
test('write outcomes distinguish approval, validation and uncertain remote writes without exposing raw errors',async()=>{
 const g=new CapabilityGateway();let error='CHANGE_NOT_APPROVED';const provider={invoke:async()=>{throw Error(error);}};installSoundlab(g,'t',provider);const p={tenant:'t',actor:'chen'};
 assert.equal((await g.invokeEnvelope('sampling.change.apply',{id:'c'},p,'key')).status,'awaiting_approval');
 error='VERSION_CONFLICT';assert.equal((await g.invokeEnvelope('sampling.change.apply',{id:'c'},p,'key')).status,'failed');
 error='secret provider detail';const unknown=await g.invokeEnvelope('sampling.change.apply',{id:'c'},p,'key');assert.equal(unknown.status,'unknown');assert.doesNotMatch(JSON.stringify(unknown),/secret/);
});
test('all scene capabilities define meaningful output contracts and reject incomplete business receipts',async()=>{
 for(const c of soundlabManifest.capabilities)assert.ok(c.output);
 const g=new CapabilityGateway();installSoundlab(g,'t',{invoke:async()=>({status:'completed'})});
 await assert.rejects(g.invoke('sampling.change.apply',{id:'c'},{tenant:'t',actor:'chen'},'key'),/PROVIDER_RESPONSE_INVALID/);
});
