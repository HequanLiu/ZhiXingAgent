import {seedDemoMembers} from '../apps/zhixing-api/members.ts';
import {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {runMigrations} from './lib/migrations.ts';
import {createOrders} from '../apps/sample-reference-service/domain.ts';
for(const name of ['business','platform'] as const){
 const fallback=name==='business'?'postgresql://soundlab_business:business-local-only@127.0.0.1:55439/soundlab_business':'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const db=new Pool({connectionString:process.env[name.toUpperCase()+'_DATABASE_URL']??fallback});
 try{
  const directory=new URL(`../migrations/${name}/`,import.meta.url);
  const files=(await readdir(directory)).filter(f=>/^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort();
  const migrations=await Promise.all(files.map(async id=>{const sql=await readFile(new URL(id,directory),'utf8');return {id,checksum:createHash('sha256').update(sql).digest('hex'),up:async(tx:import('pg').PoolClient)=>{await tx.query(sql);}};}));
  await runMigrations(db,migrations);
  if(name==='business'&&process.env.SOUNDLAB_SEED_DEMO!=='false')for(const order of createOrders())await db.query('INSERT INTO orders VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[order.tenant,order.id,JSON.stringify(order)]);
  if(name==='platform'&&process.env.SOUNDLAB_SEED_DEMO!=='false')await seedDemoMembers(db);
  if(name==='platform'){const missing=await db.query('SELECT DISTINCT u.tenant FROM auth_users u LEFT JOIN tenant_members m ON m.tenant=u.tenant AND m.actor=u.actor WHERE u.enabled=true AND m.actor IS NULL');if(missing.rowCount)throw new Error('MEMBER_REGISTRATION_REQUIRED: register verified members and roles for existing tenant logins before reopening user access; no roles were inferred.');}
  console.log(`${name}: versioned migrations applied; existing records preserved.`);
 }finally{await db.end();}
}
