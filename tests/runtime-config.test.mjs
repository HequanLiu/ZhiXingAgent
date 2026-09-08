import test from 'node:test';
import assert from 'node:assert/strict';
import {modelConfiguration} from '../packages/runtime-deepseek/index.mjs';
import {resolveRoute,providerPatch} from '../scripts/lib/model-route.mjs';
import {childEnvironment} from '../scripts/lib/runtime-probe.mjs';
test('runtime accepts validated selected-provider overrides and bounded timeouts',()=>{
 const env={SOUNDLAB_MODEL_ROUTE:'deepseek',SOUNDLAB_MODEL_ID:'custom-v1',SOUNDLAB_MODEL_BASE_URL:'https://example.com/v1',SOUNDLAB_MODEL_ANALYSIS:'true',MINIMAX_API_KEY:'other',SOUNDLAB_MODEL_INITIALIZE_TIMEOUT_MS:'1000',SOUNDLAB_MODEL_REQUEST_TIMEOUT_MS:'2000',SOUNDLAB_MODEL_RUN_TIMEOUT_MS:'3000'};
 const config=modelConfiguration(env);assert.equal(config.model,'custom-v1');assert.equal(config.enabled,false);
 assert.deepEqual(config.timeouts,{initializeTimeoutMs:1000,requestTimeoutMs:2000,runTimeoutMs:3000});
 const route=resolveRoute(env);assert.deepEqual(providerPatch(route),[{id:'llm-deepseek',config:{baseURL:'https://example.com/v1',apiKeyEnv:'DEEPSEEK_API_KEY'}}]);
 assert.equal(childEnvironment({...env,DEEPSEEK_API_KEY:'selected'},true,route.keyEnv).MINIMAX_API_KEY,undefined);
});
test('invalid config never echoes values and timeout budgets are coherent',()=>{
 for(const value of ['0','999','600001','1.5','Infinity','private-secret']) assert.throws(()=>modelConfiguration({SOUNDLAB_MODEL_RUN_TIMEOUT_MS:value}),/^Error: MODEL_CONFIGURATION_INVALID$/);
 for(const value of ['http://example.com','https://user:secret@example.com','https://example.com?q=secret','file:///tmp/key']) assert.throws(()=>resolveRoute({SOUNDLAB_MODEL_BASE_URL:value}),/^Error: MODEL_CONFIGURATION_INVALID$/);
 assert.throws(()=>resolveRoute({SOUNDLAB_MODEL_ID:'secret\nvalue'}),/^Error: MODEL_CONFIGURATION_INVALID$/);
 assert.throws(()=>modelConfiguration({SOUNDLAB_MODEL_REQUEST_TIMEOUT_MS:'90000',SOUNDLAB_MODEL_RUN_TIMEOUT_MS:'1000'}),/MODEL_CONFIGURATION_INVALID/);
});

test('runtime timeout inclusive limits and default budget remain valid',()=>{
 assert.deepEqual(modelConfiguration({}).timeouts,{initializeTimeoutMs:30000,requestTimeoutMs:60000,runTimeoutMs:90000});
 assert.equal(modelConfiguration({SOUNDLAB_MODEL_RUN_TIMEOUT_MS:'600000'}).timeouts.runTimeoutMs,600000);
 assert.equal(modelConfiguration({SOUNDLAB_MODEL_ANALYSIS:'true',MINIMAX_API_KEY:'selected'}).enabled,true);
 assert.throws(()=>resolveRoute({SOUNDLAB_MODEL_ID:''}),/MODEL_CONFIGURATION_INVALID/);
});

