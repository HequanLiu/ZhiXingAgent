import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CapabilityGateway} from '../apps/zhixing-api/gateway.ts';
test('provider replacement and tenant isolation require no gateway changes',async()=>{
  const gateway=new CapabilityGateway();
  gateway.bind('a','query',{invoke:async()=>({provider:1})});
  assert.deepEqual(await gateway.invoke('query',{}, {tenant:'a',actor:'u'}),{provider:1});
  await assert.rejects(gateway.invoke('query',{}, {tenant:'b',actor:'u'}),/CAPABILITY_UNAVAILABLE/);
  gateway.bind('a','query',{invoke:async()=>({provider:2})});
  assert.deepEqual(await gateway.invoke('query',{}, {tenant:'a',actor:'u'}),{provider:2});
});
test('gateway core does not import sampling domain or database packages',async()=>{
  const source=await readFile(new URL('../apps/zhixing-api/gateway.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/sampling-contracts|sample-reference|from ['"]pg/);
});
