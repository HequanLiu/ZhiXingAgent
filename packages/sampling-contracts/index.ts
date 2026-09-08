export const people: Record<string, string> = { chen: '陈静', wang: '王磊', li: '李工', zhao: '赵强', zhou: '周敏', liu: '刘芳' };
export type NodeState = 'not_started' | 'in_progress' | 'blocked' | 'reported_complete' | 'accepted' | 'rework';
export interface ReviewRecord {actor:string;at:string;note:string;sourceVersion:number}
export interface SampleNode { id: string; name: string; owner: string; due: string; percent: number; status: NodeState; weight: number; dependencies?:string[];durationDays?:number;plannedStart?:string;expectedFinish?:string;materialEta?:string;acceptanceCriteria?:string; acceptance?:ReviewRecord;reworks?:(ReviewRecord & {previousPercent:number})[] }
export interface Feedback { id: string; nodeId: string; actor: string; completed: number; total: number; blocker: string; at: string;round?:number;mode?:'quantity'|'percent';expectedFinish?:string;materialEta?:string }
export interface WorkCalendar {weekdays:number[];holidays:string[]}
export type NodeConfiguration = Pick<SampleNode,'id'|'name'|'owner'|'due'|'weight'|'dependencies'|'durationDays'|'plannedStart'|'acceptanceCriteria'>;
export interface ProjectConfigurationSnapshot {calendar?:WorkCalendar;nodes:NodeConfiguration[]}
export interface ProjectConfigurationInput {expectedVersion:number;calendar:WorkCalendar;nodes:(NodeConfiguration & Required<Pick<NodeConfiguration,'dependencies'|'durationDays'|'acceptanceCriteria'>>)[]}
export interface ProjectConfigurationRecord {actor:string;at:string;sourceVersion:number;before:ProjectConfigurationSnapshot;after:ProjectConfigurationSnapshot}
export interface ScheduleEvaluation {forecast:string|null;risk:'normal'|'attention'|'risk';asOf:string;sourceVersion:number;missing:string[];nodes:{nodeId:string;start:string|null;finish:string|null;basis:string}[]}
export interface Order { id: string; tenant: string; product: string; customer: string; version: number; due: string; risk: 'normal'|'attention'|'risk'; forecast: string|null; nodes: SampleNode[]; feedback: Feedback[];calendar?:WorkCalendar;schedule?:ScheduleEvaluation;configurationHistory?:ProjectConfigurationRecord[] }
export interface FeedbackInput { nodeId: string; completed?: number; total?: number; blocker?: string; expectedVersion: number;mode?:'quantity'|'percent';percent?:number;expectedFinish?:string;materialEta?:string }
export interface AcceptanceInput {nodeId:string;expectedVersion:number;note?:string}
export interface MutationInput extends AcceptanceInput {completed?:number;total?:number;blocker?:string;owner?:string;mode?:'quantity'|'percent';percent?:number;expectedFinish?:string;materialEta?:string}
