import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
test('attachment inputs enforce bounded canonical binary and safe names',async()=>{
 assert.ok(existsSync('apps/sample-reference-service/attachments.ts'),'attachment service must exist');
 const {validateAttachmentInput}=await import('./helpers/attachments.ts');
 const bytes=Buffer.from('%PDF-1.7\nexample\n%%EOF');
 const input={orderId:'A26-018',nodeId:'assembly',expectedVersion:1,filename:'证据.pdf',mime:'application/pdf',base64:bytes.toString('base64')};
 assert.deepEqual(validateAttachmentInput(input).data,bytes);
 for(const patch of [{base64:'!!!!'},{base64:input.base64+'\n'},{base64:''},{mime:'text/html'},{mime:'image/png'},{filename:'../x.pdf'},{filename:'a\u0000.pdf'},{filename:'x'.repeat(121)},{expectedVersion:0},{base64:Buffer.alloc(2*1024*1024+1).toString('base64')},{extra:true}])assert.throws(()=>validateAttachmentInput({...input,...patch}),/VALIDATION_ERROR|ATTACHMENT_TOO_LARGE/);
 for(const [mime,data] of [['image/png',Buffer.from([137,80,78,71,13,10,26,10,0])],['image/jpeg',Buffer.from([255,216,255,224,0])]] as const)assert.deepEqual(validateAttachmentInput({...input,mime,base64:data.toString('base64')}).data,data);
});
