import test from 'node:test';
import assert from 'node:assert/strict';
const valid={route:'minimax',enabled:true,initializeTimeoutMs:30000,requestTimeoutMs:60000,runTimeoutMs:90000,analysisIntervalMs:5000};
test('settings validate before use, retain secrets only in env copy, and clear optional overrides',async()=>{
 const mod=await import('../apps/platform-worker/runtime-settings.ts');
 assert.equal(typeof mod.applyRuntimeSettings,'function');
 const base={MINIMAX_API_KEY:'private',DEEPSEEK_API_KEY:'other',SOUNDLAB_MODEL_ID:'previous',SOUNDLAB_MODEL_BASE_URL:'https://old.example.com',PATH:'base'};
 const applied=mod.applyRuntimeSettings(base,valid);
 assert.equal(applied.MINIMAX_API_KEY,'private');assert.equal(applied.PATH,'base');assert.equal(applied.SOUNDLAB_MODEL_ROUTE,'minimax');
 assert.equal(applied.SOUNDLAB_MODEL_ID,undefined);assert.equal(applied.SOUNDLAB_MODEL_BASE_URL,undefined);assert.equal(base.SOUNDLAB_MODEL_ID,'previous');
 assert.notEqual(mod.applyRuntimeSettings(base,null),base);
 for(const patch of [{apiKey:'secret'},{MINIMAX_API_KEY:'secret'},{route:'oops'},{enabled:'true'},{runTimeoutMs:89999},{analysisIntervalMs:0},{initializeTimeoutMs:1.5},{baseURL:'https://user:private@example.com'},{modelId:'private\nvalue'}]) {
  assert.throws(()=>mod.applyRuntimeSettings(base,{...valid,...patch}),/^Error: VALIDATION_ERROR$/);
 }
});


test('applying route changes preserves only the selected credential in the child environment',async()=>{
 const {applyRuntimeSettings}=await import('../apps/platform-worker/runtime-settings.ts');
 const {childEnvironment}=await import(new URL('../scripts/lib/runtime-probe.mjs',import.meta.url).href);
 const base={MINIMAX_API_KEY:'minimax-private',DEEPSEEK_API_KEY:'deepseek-private'};
 const env=applyRuntimeSettings(base,{...valid,route:'deepseek',modelId:'custom-v1',baseURL:'https://api.deepseek.com'});
 assert.equal(env.SOUNDLAB_MODEL_ID,'custom-v1');
 const child=childEnvironment(env,true,'DEEPSEEK_API_KEY');
 assert.equal(child.DEEPSEEK_API_KEY,'deepseek-private');assert.equal(child.MINIMAX_API_KEY,undefined);
 assert.deepEqual(base,{MINIMAX_API_KEY:'minimax-private',DEEPSEEK_API_KEY:'deepseek-private'});
});




test('browser settings cannot redirect provider credentials to an unapproved endpoint',async()=>{
 const {applyRuntimeSettings}=await import('../apps/platform-worker/runtime-settings.ts');
 for(const baseURL of ['https://attacker.example/v1','https://api.minimax.cn.evil.example/v1','https://api.minimax.cn:444/v1','https://api.minimax.cn/v1/redirect','https://api.minimax.cn/v1?target=evil','https://user:pass@api.minimax.cn/v1','https://api.deepseek.com','https://api.minimax.cn/v1#evil']) {
  assert.throws(()=>applyRuntimeSettings({MINIMAX_API_KEY:'private'},{...valid,baseURL}),/^Error: VALIDATION_ERROR$/);
 }
 assert.equal(applyRuntimeSettings({},{...valid,baseURL:'https://api.minimax.cn/v1'}).SOUNDLAB_MODEL_BASE_URL,'https://api.minimax.cn/v1');
 assert.equal(applyRuntimeSettings({},{...valid,route:'deepseek',baseURL:'https://api.deepseek.com'}).SOUNDLAB_MODEL_BASE_URL,'https://api.deepseek.com');
 const operatorEnv={SOUNDLAB_MODEL_BASE_URL:'https://operator.example/v1'};
 assert.deepEqual(applyRuntimeSettings(operatorEnv,null),operatorEnv);
});
