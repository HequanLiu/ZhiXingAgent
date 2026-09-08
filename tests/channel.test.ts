import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import {verifyChannelSignature} from '../apps/zhixing-api/channel.ts';
test('channel signatures bind payload and reject stale or forged events',()=>{
 const secret='test-channel-secret-1234567890123456',body={eventId:'one'},timestamp='1788742800';const now=Number(timestamp)*1000;
 const signature=createHmac('sha256',secret).update(timestamp+'.'+JSON.stringify(body)).digest('hex');
 verifyChannelSignature(secret,timestamp,signature,body,now);
 assert.throws(()=>verifyChannelSignature(secret,timestamp,signature,{eventId:'two'},now),/FORBIDDEN/);
 assert.throws(()=>verifyChannelSignature(secret,timestamp,signature,body,now+301000),/FORBIDDEN/);
 assert.throws(()=>verifyChannelSignature('',timestamp,signature,body,now),/CHANNEL_NOT_CONFIGURED/);
});
