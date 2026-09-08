import { harnessSource } from '../../apps/zhixing-harness/source.mjs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { childEnvironment } from '../../scripts/lib/runtime-probe.mjs';
import { resolveRoute, providerPatch } from '../../scripts/lib/model-route.mjs';
import {runtimeTimeouts} from './config.mjs';
import {assertRunCompleted,extractUsage} from './result.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export function modelConfiguration(env=process.env) {
  const route=resolveRoute(env);
  return {provider:route.provider,model:route.model,timeouts:runtimeTimeouts(env),enabled:env.SOUNDLAB_MODEL_ANALYSIS==='true' && !!env[route.keyEnv]?.trim()};
}
// Generic runtime owns process lifecycle; scenario supplies prompt and plugin composition.
export async function runModel({prompt,pluginURL,signal,chat=false,chatToken}) {
  const route=resolveRoute(process.env);
  const configuration=modelConfiguration();
  if(!(chat?process.env.SOUNDLAB_CHAT_ENABLED==='true'&&!!process.env[route.keyEnv]?.trim():configuration.enabled))throw new Error('MODEL_NOT_CONFIGURED');
  const source=harnessSource();
  const {DeepSeekHarness}=await import(pathToFileURL(resolve(source,'packages/sdk/client/lib/index.js')).href);
  const runId=randomUUID();
  const home=resolve(root,'.runtime/analysis',runId);
  await mkdir(home,{recursive:true});
  const receiptsFile=resolve(home,'business-receipts.jsonl');
  const patch=resolve(home,'runtime.patch.yml');
  await writeFile(patch,JSON.stringify([...providerPatch(route),...(pluginURL?[{insert:[{id:'scenario-readonly-tools',name:pluginURL,
    config:{toolsModule:pathToFileURL(resolve(source,'packages/core/tools/lib/index.js')).href,receiptsFile,maxCalls:2,...(chatToken?{chatToken}:{})}}]}]:[])]));
  const harness=new DeepSeekHarness({profile:'sdk-minimal',dshHome:home,cwd:root,processCwd:source,
    patches:[resolve(root,'apps/zhixing-harness/probe.patch.yml'),patch],provider:route.provider,model:route.model,
    env:childEnvironment(process.env,true,route.keyEnv),maxTokens:2048,initializeTimeoutMs:configuration.timeouts.initializeTimeoutMs,requestTimeoutMs:configuration.timeouts.requestTimeoutMs});
  let timer;
  let abort;
  try {
    if(signal?.aborted)throw new Error('MODEL_STOPPED');
    const result=await Promise.race([harness.run(prompt),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('MODEL_TIMEOUT')),configuration.timeouts.runTimeoutMs);
      abort=()=>reject(new Error('MODEL_STOPPED'));
      signal?.addEventListener('abort',abort,{once:true});
    })]);
    assertRunCompleted(result.events);
    const receiptText=pluginURL?await readFile(receiptsFile,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;}):'';
    const receipts=receiptText.trim()?receiptText.trim().split('\n').map(line=>JSON.parse(line)):[];
    return {runId,provider:route.provider,model:route.model,summary:result.finalResponse,receipts,usage:extractUsage(result.events)};
  } catch(error) {
    const known=['MODEL_STOPPED','MODEL_TIMEOUT'];
    throw new Error(known.includes(error?.message)?error.message:'MODEL_ANALYSIS_FAILED');
  } finally {
    clearTimeout(timer);
    if(abort)signal?.removeEventListener('abort',abort);
    await harness.close();
  }
}


