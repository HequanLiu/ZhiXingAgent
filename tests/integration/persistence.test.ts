import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {pool,list,mutate} from '../helpers/store.ts';
import {createOrders} from '../helpers/domain.ts';
test('PostgreSQL: tenant isolation, atomic events, idempotent replay and concurrent stale rejection',async()=>{
  const tenant=`test-${randomUUID()}`;
  const order={...createOrders()[0],tenant};
  try{
    await pool.query('INSERT INTO orders VALUES($1,$2,$3)',[tenant,order.id,JSON.stringify(order)]);
    assert.equal((await list(tenant)).length,1);
    assert.equal((await list(`${tenant}-other`)).length,0);
    const input={nodeId:'assembly',completed:13,total:20,blocker:'待料',expectedVersion:1};
    const first=await mutate(tenant,'zhao',order.id,'same','feedback',input);
    const replay=await mutate(tenant,'zhao',order.id,'same','feedback',input);
    assert.deepEqual(replay,first);
    assert.equal(first.version,2);
    await assert.rejects(mutate(tenant,'zhao',order.id,'same','feedback',{...input,completed:14}),/IDEMPOTENCY_CONFLICT/);
    await assert.rejects(mutate(tenant,'zhou',order.id,'wrong-owner','feedback',{...input,expectedVersion:2}),/FORBIDDEN/);
    const concurrent=await Promise.allSettled(['one','two'].map(key=>mutate(tenant,'zhao',order.id,key,'feedback',{...input,expectedVersion:2})));
    assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(concurrent.filter(r=>r.status==='rejected').length,1);
    const counts=await pool.query('SELECT count(*)::integer AS n FROM outbox WHERE tenant=$1',[tenant]);
    assert.equal(counts.rows[0].n,2);
    assert.equal((await list(tenant))[0].version,3);
  }finally{
    // Only records owned by this uniquely named test tenant are removed.
    await pool.query('DELETE FROM outbox WHERE tenant=$1',[tenant]);
    await pool.query('DELETE FROM mutations WHERE tenant=$1',[tenant]);
    await pool.query('DELETE FROM orders WHERE tenant=$1',[tenant]);
  }
});
test('platform database role cannot read business tables',async()=>{
  const isolated=new Pool({connectionString:'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_business'});
  try{await assert.rejects(isolated.query('SELECT * FROM orders'),(error:unknown)=>(error as {code:string}).code==='42501');}finally{await isolated.end();}
});
test('acceptance persists audit and publishes one event under idempotent replay',async()=>{
  const tenant=`test-${randomUUID()}`;const order={...createOrders()[0],tenant};
  try {
    await pool.query('INSERT INTO orders VALUES($1,$2,$3)',[tenant,order.id,JSON.stringify(order)]);
    await mutate(tenant,'zhao',order.id,'complete','feedback',{nodeId:'assembly',completed:20,total:20,expectedVersion:1});
    const input={nodeId:'assembly',expectedVersion:2,note:'数量和装配检查通过'};
    await assert.rejects(mutate(tenant,'zhao',order.id,'forbidden-accept','accept',input),/FORBIDDEN/);
    const first=await mutate(tenant,'chen',order.id,'accept-once','accept',input);
    assert.deepEqual(await mutate(tenant,'chen',order.id,'accept-once','accept',input),first);
    await assert.rejects(mutate(tenant,'chen',order.id,'accept-again','accept',{...input,expectedVersion:3}),/NODE_CLOSED/);
    const saved=(await list(tenant))[0];
    assert.equal(saved.version,3);assert.equal(saved.nodes[3].acceptance?.note,input.note);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM outbox WHERE tenant=$1',[tenant])).rows[0].n,2);
  } finally {
    await pool.query('DELETE FROM outbox WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM mutations WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM orders WHERE tenant=$1',[tenant]);
  }
});
test('rework replay keeps one history record and round survives reacceptance',async()=>{
  const tenant=`test-${randomUUID()}`;const order={...createOrders()[0],tenant};
  try {
    await pool.query('INSERT INTO orders VALUES($1,$2,$3)',[tenant,order.id,JSON.stringify(order)]);
    await mutate(tenant,'zhao',order.id,'complete','feedback',{nodeId:'assembly',completed:20,total:20,expectedVersion:1});
    const input={nodeId:'assembly',expectedVersion:2,note:'演示返工复检'};
    const returned=await mutate(tenant,'chen',order.id,'return-once','return',input);
    assert.deepEqual(await mutate(tenant,'chen',order.id,'return-once','return',input),returned);
    await assert.rejects(mutate(tenant,'chen',order.id,'repeat-return','return',{...input,expectedVersion:3}),/NODE_NOT_READY/);
    await mutate(tenant,'zhao',order.id,'recomplete','feedback',{nodeId:'assembly',completed:20,total:20,expectedVersion:3});
    await mutate(tenant,'chen',order.id,'accept','accept',{nodeId:'assembly',expectedVersion:4});
    const saved=(await list(tenant))[0];assert.equal(saved.version,5);
    assert.equal(saved.nodes[3].reworks?.length,1);assert.equal(saved.nodes[3].status,'accepted');assert.equal(saved.feedback[0].round,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM outbox WHERE tenant=$1',[tenant])).rows[0].n,4);
  } finally {
    await pool.query('DELETE FROM outbox WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM mutations WHERE tenant=$1',[tenant]);await pool.query('DELETE FROM orders WHERE tenant=$1',[tenant]);
  }
});
test.after(async()=>{await pool.end();});
