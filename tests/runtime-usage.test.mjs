import test from 'node:test';
import assert from 'node:assert/strict';
import * as result from '../packages/runtime-deepseek/result.mjs';
const message=(step,usage,extra={})=>({type:'assistant/message',seq:step+10,data:{turn:1,step,usage,...extra}});
test('usage sums disjoint reported counters once per event or turn/step without deriving prices',()=>{
 assert.equal(typeof result.extractUsage,'function');
 const first=message(1,{inputTokens:10,outputTokens:5,totalTokens:21,cacheReadTokens:4,cacheWriteTokens:2,reasoningTokens:3});
 const second=message(2,{inputTokens:20,outputTokens:7,totalTokens:30,cacheReadTokens:2,cacheWriteTokens:1,reasoningTokens:4});
 assert.deepEqual(result.extractUsage([first,first,{...first,seq:99},second]),{inputTokens:30,outputTokens:12,totalTokens:51,cacheReadTokens:6,cacheWriteTokens:3,reasoningTokens:7,partial:false,cost:null});
});
test('unknown usage stays null, incomplete accounting stays partial, optional counters remain unknown',()=>{
 assert.equal(typeof result.extractUsage,'function');
 assert.equal(result.extractUsage([]),null);assert.equal(result.extractUsage([message(1,undefined)]),null);
 const good=message(1,{inputTokens:0,outputTokens:0});
 assert.deepEqual(result.extractUsage([good]),{inputTokens:0,outputTokens:0,totalTokens:null,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null,partial:false,cost:null});
 for(const extra of [message(2,undefined),message(2,{inputTokens:-1,outputTokens:3}),message(2,{inputTokens:1.5,outputTokens:3}),message(2,{inputTokens:Infinity,outputTokens:3}),{type:'assistant/attempt',data:{turn:1,step:2}},{type:'turn/end',data:{reason:{kind:'aborted'}}}])assert.equal(result.extractUsage([good,extra]).partial,true);
 assert.equal(result.extractUsage([message(1,{inputTokens:2,outputTokens:3},{interrupted:true})]).partial,true);
 assert.equal(result.extractUsage([message(1,{inputTokens:2,outputTokens:3,totalTokens:'private'})]).partial,true);
});
