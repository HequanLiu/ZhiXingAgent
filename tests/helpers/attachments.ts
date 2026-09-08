import * as source from '../../apps/sample-reference-service/attachments.ts';
import {scoped} from './members.ts';
export * from '../../apps/sample-reference-service/attachments.ts';
export const uploadAttachment:typeof source.uploadAttachment=scoped(source.uploadAttachment,a=>a[1].tenant);
export const listAttachments:typeof source.listAttachments=scoped(source.listAttachments,a=>a[1].tenant);
export const readAttachment:typeof source.readAttachment=scoped(source.readAttachment,a=>a[1].tenant);
