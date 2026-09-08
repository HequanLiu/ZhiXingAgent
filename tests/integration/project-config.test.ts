import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,createProject,configureStoredProject} from '../helpers/store.ts';
const initial={id:'CONFIG-001',product:'speaker',customer:'test',due:'2026-09-30',calendar:{weekdays:[1,2,3,4,5],holidays:[]},nodes:[{id:'a',name:'assembly',owner:'zhao',due:'2026-09-20',weight:1,durationDays:2,dependencies:[],acceptanceCriteria:'passed'}]};
test('configuration persistence is atomic, idempotent and serializes concurrent updates',async()=>{
  const tenant='config-'+randomUUID();const input={expectedVersion:1,calendar:initial.calendar,nodes:[{...initial.nodes[0],durationDays:4}]};
  try{
    await createProject(tenant,'chen','create',initial);
    await assert.rejects(configureStoredProject(tenant,'zhao',initial.id,'forbidden',input),/FORBIDDEN/);
    await assert.rejects(configureStoredProject(tenant,'chen',initial.id,'invalid',{...input,nodes:[{...input.nodes[0],status:'accepted'}]}),/VALIDATION_ERROR/);
    const [a,b]=await Promise.all([configureStoredProject(tenant,'chen',initial.id,'same',input),configureStoredProject(tenant,'chen',initial.id,'same',input)]);
    assert.deepEqual(a,b);assert.equal(a.version,2);assert.equal(a.configurationHistory!.length,1);
    await assert.rejects(configureStoredProject(tenant,'chen',initial.id,'same',{...input,nodes:[{...input.nodes[0],durationDays:5}]}),/IDEMPOTENCY_CONFLICT/);
    await assert.rejects(configureStoredProject(tenant,'chen',initial.id,'stale',input),/VERSION_CONFLICT/);
    const outcomes=await Promise.allSettled(['first','second'].map(key=>configureStoredProject(tenant,'chen',initial.id,key,{...input,expectedVersion:2})));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.match((outcomes.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message,/VERSION_CONFLICT/);
    const saved=(await pool.query('SELECT data FROM orders WHERE tenant=$1 AND id=$2',[tenant,initial.id])).rows[0].data;
    assert.equal(saved.version,3);assert.equal(saved.configurationHistory.length,2);assert.equal(saved.nodes[0].status,'not_started');
    assert.equal((await pool.query('SELECT count(*)::int n FROM outbox WHERE tenant=$1',[tenant])).rows[0].n,3);
    assert.equal((await pool.query('SELECT count(*)::int n FROM mutations WHERE tenant=$1',[tenant])).rows[0].n,3);
    await assert.rejects(configureStoredProject(tenant+'-other','chen',initial.id,'tenant',input),/NOT_FOUND/);
  }finally{
    await pool.query('DELETE FROM outbox WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM mutations WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM orders WHERE tenant=$1',[tenant]);
  }
});
test.after(()=>pool.end());
