import * as source from '../../apps/soundlab-api/changes.ts';
import {scoped} from './members.ts';
export * from '../../apps/soundlab-api/changes.ts';
export const proposeChange:typeof source.proposeChange=scoped(source.proposeChange,a=>a[1].tenant);
export const decideChange:typeof source.decideChange=scoped(source.decideChange,a=>a[1].tenant);
export const applyChange:typeof source.applyChange=scoped(source.applyChange,a=>a[1].tenant);
export const listChanges:typeof source.listChanges=scoped(source.listChanges,a=>a[1].tenant);
export const getInvocation:typeof source.getInvocation=scoped(source.getInvocation,a=>a[1].tenant);
export const getChange:typeof source.getChange=scoped(source.getChange,a=>a[1].tenant);
