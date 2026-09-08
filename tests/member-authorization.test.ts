import test from 'node:test';
import assert from 'node:assert/strict';
import {withMembers,assertManager,assertIdentity,activeOwner} from '../packages/member-authorization/index.ts';
const members=[{tenant:'acme',actor:'new-manager',displayName:'经理',role:'manager' as const,enabled:true,version:1},{tenant:'acme',actor:'new-member',displayName:'员工',role:'member' as const,enabled:true,version:1},{tenant:'other',actor:'foreign',displayName:'外部',role:'manager' as const,enabled:true,version:1},{tenant:'acme',actor:'disabled',displayName:'停用',role:'manager' as const,enabled:false,version:1}];
test('authorization fails closed without a trusted directory context',()=>{assert.throws(()=>assertManager('chen'),/FORBIDDEN/);assert.equal(activeOwner('new-member'),false);});
test('dynamic managers keep their actor and cannot impersonate another member',()=>withMembers('acme',members,()=>{assert.doesNotThrow(()=>assertManager('new-manager'));assert.throws(()=>assertManager('new-member'),/FORBIDDEN/);assert.throws(()=>assertManager('disabled'),/FORBIDDEN/);assert.throws(()=>assertIdentity({tenant:'other',actor:'foreign'}),/FORBIDDEN/);assert.equal(activeOwner('foreign'),false);assert.equal(activeOwner('new-member'),true);}));
test('interleaved async tenant scopes never leak managers or owners',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await Promise.all([withMembers('acme',members,async()=>{await gate;assert.doesNotThrow(()=>assertManager('new-manager'));assert.throws(()=>assertManager('foreign'),/FORBIDDEN/);}),withMembers('other',members,async()=>{assert.doesNotThrow(()=>assertManager('foreign'));release();await Promise.resolve();assert.equal(activeOwner('new-member'),false);})]);
 assert.throws(()=>assertManager('new-manager'),/FORBIDDEN/);
});
