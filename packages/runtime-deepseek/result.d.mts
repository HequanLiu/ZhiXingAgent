import type {Receipt} from './index.mjs';
export function verifyAnalysis(summary:string,receipts:Receipt[],expected:{id:string;version:number;capability:string}):{summary:string;observedVersion:number};
export function retryState(attempts:number):{status:'failed'|'retry';delaySeconds:number};
export function safeAnalysisError(error:unknown):string;
export interface UsageSummary {
  inputTokens:number;outputTokens:number;totalTokens:number|null;
  cacheReadTokens:number|null;cacheWriteTokens:number|null;reasoningTokens:number|null;
  partial:boolean;cost:null;
}
export function extractUsage(events:unknown):UsageSummary|null;
