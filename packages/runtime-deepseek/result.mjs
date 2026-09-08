export function verifyAnalysis(summary, receipts, expected) {
  if(typeof summary==='string')summary=summary.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi,'').trim();
  if(typeof summary==='string' && /<\/?think\b/i.test(summary))throw new Error('MODEL_OUTPUT_INVALID');
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 6000) throw new Error('MODEL_OUTPUT_INVALID');
  const object=receipts.filter(r=>r.capability===expected.capability).flatMap(r=>r.objects??[])
    .find(item=>item.id===expected.id && Number.isSafeInteger(item.version) && item.version>=expected.version);
  if(!object)throw new Error('EVIDENCE_MISSING');
  return {summary:summary.trim(),observedVersion:object.version};
}
export function retryState(attempts) {
  return attempts>=3?{status:'failed',delaySeconds:0}:{status:'retry',delaySeconds:attempts===1?10:30};
}
export function assertRunCompleted(events) {
  const reason=events.filter(e=>e.type==='turn/end').at(-1)?.data?.reason;
  if(reason?.kind==='error')throw new Error(reason.error?.code==='TIMEOUT'?'MODEL_TIMEOUT':'MODEL_ANALYSIS_FAILED');
}
export function safeAnalysisError(error) {
  const allowed=['MODEL_TIMEOUT','MODEL_STOPPED','MODEL_ANALYSIS_FAILED','EVIDENCE_MISSING','MODEL_OUTPUT_INVALID','ANALYSIS_SCHEMA_INVALID'];
  return allowed.includes(error?.message)?error.message:'ANALYSIS_FAILED';
}

// Harness TokenUsage input is uncached input; cache counters are disjoint, reasoning is not added again.
export function extractUsage(events) {
  if(!Array.isArray(events))return null;
  const optional=['totalTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'];
  const totals={inputTokens:0,outputTokens:0,totalTokens:0,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0};
  const seen=new Set();let partial=false;let samples=0;
  const count=value=>Number.isSafeInteger(value)&&value>=0;
  for(const event of events){
    if(event?.type==='assistant/attempt'||(event?.type==='turn/end'&&event.data?.reason?.kind!=='completed'))partial=true;
    if(event?.type!=='assistant/message')continue;
    const data=event.data??{};
    if(data.interrupted)partial=true;
    const keys=[];
    if(typeof event.id==='string'&&event.id)keys.push(`id:${event.id}`);
    if(Number.isSafeInteger(event.seq))keys.push(`seq:${event.seq}`);
    if(Number.isSafeInteger(data.turn)&&Number.isSafeInteger(data.step))keys.push(`step:${data.turn}:${data.step}`);
    if(keys.length===0){partial=true;continue;}
    if(keys.some(key=>seen.has(key)))continue;
    for(const key of keys)seen.add(key);
    const usage=data.usage;
    if(!usage||!count(usage.inputTokens)||!count(usage.outputTokens)||!count(totals.inputTokens+usage.inputTokens)||!count(totals.outputTokens+usage.outputTokens)){partial=true;continue;}
    totals.inputTokens+=usage.inputTokens;totals.outputTokens+=usage.outputTokens;samples++;
    for(const key of optional){
      if(usage[key]===undefined){totals[key]=null;continue;}
      if(!count(usage[key])){totals[key]=null;partial=true;continue;}
      if(totals[key]!==null){
        if(count(totals[key]+usage[key]))totals[key]+=usage[key];else{totals[key]=null;partial=true;}
      }
    }
  }
  return samples?{...totals,partial,cost:null}:null;
}
