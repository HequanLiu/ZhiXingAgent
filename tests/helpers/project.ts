import * as source from '../../apps/sample-reference-service/project.ts';
import {scoped} from './members.ts';
export * from '../../apps/sample-reference-service/project.ts';
export const newProject:typeof source.newProject=scoped(source.newProject,a=>a[1]);
export const configureProject:typeof source.configureProject=scoped(source.configureProject,a=>a[0].tenant);
export const projectConfiguration:typeof source.projectConfiguration=scoped(source.projectConfiguration,a=>'demo');
