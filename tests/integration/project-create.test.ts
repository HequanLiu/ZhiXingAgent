import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,createProject,list} from '../helpers/store.ts';
const input={id:'NEW-001',product:'测试音箱',customer:'测试客户',due:'2026-09-30',calendar:{weekdays:[1,2,3,4,5],holidays:[]},nodes:[{id:'a',name:'装配',owner:'zhao',due:'2026-09-29',weight:1,durationDays:2,dependencies:[],acceptanceCriteria:'合格'}]};
test('project creation atomically persists one order and one event; duplicates conflict',async()=>{
  const tenant='test-'+randomUUID();
  try {
    await assert.rejects(createProject(tenant,'zhao','no',input),/FORBIDDEN/);
    const p=await createProject(tenant,'chen','create',input);
    assert.deepEqual(await createProject(tenant,'chen','create',input),p);
    await assert.rejects(createProject(tenant,'chen','other',input),/ORDER_EXISTS/);
    await assert.rejects(createProject(tenant,'chen','create',{...input,product:'changed'}),/IDEMPOTENCY_CONFLICT/);
    assert.equal((await list(tenant)).length,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM outbox WHERE tenant=$1',[tenant])).rows[0].n,1);
  } finally {
    await pool.query('DELETE FROM outbox WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM mutations WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM orders WHERE tenant=$1',[tenant]);
  }
});
test.after(()=>pool.end());
