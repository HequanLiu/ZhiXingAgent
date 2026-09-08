import * as source from '../../apps/sample-reference-service/store.ts';
import {scoped} from './members.ts';
export * from '../../apps/sample-reference-service/store.ts';
export const createProject:typeof source.createProject=scoped(source.createProject,a=>a[0]);
export const mutate:typeof source.mutate=scoped(source.mutate,a=>a[0]);
export const configureStoredProject:typeof source.configureStoredProject=scoped(source.configureStoredProject,a=>a[0]);
export const createProjectBatch:typeof source.createProjectBatch=scoped(source.createProjectBatch,a=>a[0]);
export const saveProjectTemplate:typeof source.saveProjectTemplate=scoped(source.saveProjectTemplate,a=>a[0]);
export const deleteProjectTemplate:typeof source.deleteProjectTemplate=scoped(source.deleteProjectTemplate,a=>a[0]);
