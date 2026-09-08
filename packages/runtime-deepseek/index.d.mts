import type {UsageSummary} from './result.mjs';
export interface Receipt { capability:string; objects:{id:string;version:number;evidence?:unknown}[]; at:string; orderCount:number }
export interface ModelResult { runId:string;provider:string;model:string;summary:string;receipts:Receipt[];usage:UsageSummary|null }
export function modelConfiguration(env?:NodeJS.ProcessEnv):{provider:string;model:string;enabled:boolean;timeouts:{initializeTimeoutMs:number;requestTimeoutMs:number;runTimeoutMs:number}};
export function runModel(options:{prompt:string;pluginURL?:string;signal?:AbortSignal;chat?:boolean;chatToken?:string}):Promise<ModelResult>;


