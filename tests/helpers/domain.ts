import * as source from '../../apps/sample-reference-service/domain.ts';
import {scoped} from './members.ts';
export * from '../../apps/sample-reference-service/domain.ts';
export const applyFeedback:typeof source.applyFeedback=scoped(source.applyFeedback,a=>a[0].tenant);
export const acceptNode:typeof source.acceptNode=scoped(source.acceptNode,a=>a[0].tenant);
export const returnNode:typeof source.returnNode=scoped(source.returnNode,a=>a[0].tenant);
export const assignOwner:typeof source.assignOwner=scoped(source.assignOwner,a=>a[0].tenant);
