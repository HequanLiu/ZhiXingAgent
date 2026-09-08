import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
test('versioned migrations serialize, reject changed history, and roll back failed DDL with its ledger',async()=>{
 const {runMigrations}=await import('../../scripts/lib/migrations.ts');
 const connectionString='postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform';
 const root=new Pool({connectionString});const schema='test_migrations_'+randomUUID().replaceAll('-','');
 await root.query(`CREATE SCHEMA ${schema}`);const db=new Pool({connectionString,options:`-c search_path=${schema}`});
 const first={id:'001',checksum:'abc',up:async(tx:any)=>{await tx.query('CREATE TABLE migrated_rows(id integer)');await tx.query('INSERT INTO migrated_rows VALUES(1)');}};
 try{
  await Promise.all([runMigrations(db,[first]),runMigrations(db,[first])]);
  assert.equal((await db.query('SELECT * FROM migrated_rows')).rowCount,1);
  await assert.rejects(runMigrations(db,[{...first,checksum:'changed'}]),/MIGRATION_HISTORY_CHANGED/);
  await assert.rejects(runMigrations(db,[first,{id:'002',checksum:'broken',up:async(tx:any)=>{await tx.query('CREATE TABLE failed_rows(id integer)');throw Error('failed');}}]),/failed/);
  assert.equal((await db.query("SELECT to_regclass('failed_rows') AS name")).rows[0].name,null);
  assert.equal((await db.query('SELECT * FROM schema_migrations')).rowCount,1);
  await runMigrations(db,[first,{id:'002',checksum:'fixed',up:async(tx:any)=>{await tx.query('ALTER TABLE migrated_rows ADD COLUMN note text');}}]);
  assert.equal((await db.query('SELECT * FROM schema_migrations')).rowCount,2);
  await runMigrations(db,[first,{id:'002',checksum:'fixed',up:async()=>{}},{id:'004',checksum:'four',up:async()=>{}}]);
  await assert.rejects(runMigrations(db,[first,{id:'002',checksum:'fixed',up:async()=>{}},{id:'003',checksum:'three',up:async()=>{}},{id:'004',checksum:'four',up:async()=>{}}]),/MIGRATION_HISTORY_CHANGED/);
 }finally{await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});

for(const database of ['business','platform'] as const)test(`${database} real SQL migrations preserve pre-existing records and replay without changes`,async()=>{
 const {runMigrations}=await import('../../scripts/lib/migrations.ts');
 const password=database==='business'?'business-local-only':'platform-local-only';
 const root=new Pool({connectionString:`postgresql://soundlab_${database}:${password}@127.0.0.1:55439/soundlab_${database}`});
 const schema='test_preserve_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);
 const db=new Pool({connectionString:`postgresql://soundlab_${database}:${password}@127.0.0.1:55439/soundlab_${database}`,options:`-c search_path=${schema}`});
 const payload={id:'existing',tenant:'customer',version:17,nested:{note:'keep existing data',values:[1,2,3]}};
 try{
  if(database==='business'){
   await db.query('CREATE TABLE orders(tenant text NOT NULL,id text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(tenant,id))');
   await db.query('INSERT INTO orders VALUES($1,$2,$3)',['customer','existing',JSON.stringify(payload)]);
  }else{
   await db.query('CREATE TABLE runtime_settings(tenant text PRIMARY KEY,version integer NOT NULL DEFAULT 0,settings jsonb,updated_at timestamptz NOT NULL DEFAULT now())');
   await db.query('INSERT INTO runtime_settings(tenant,version,settings) VALUES($1,$2,$3)',['demo',17,JSON.stringify(payload)]);
   await db.query("CREATE TABLE analysis_jobs(event_id text PRIMARY KEY,tenant text NOT NULL,object_id text NOT NULL,version integer NOT NULL,status text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),summary text,observed_version integer,provider text,model text,run_id text,receipts jsonb,error_code text)");
   await db.query("INSERT INTO analysis_jobs(event_id,tenant,object_id,version,status,summary) VALUES('legacy-event','customer','existing',17,'completed','preserve historical result')");
  }
  const preservedQuery=database==='business'?'SELECT * FROM orders ORDER BY tenant,id':'SELECT * FROM runtime_settings ORDER BY tenant';
  const before=(await db.query(preservedQuery)).rows;
  const directory=new URL(`../../migrations/${database}/`,import.meta.url);
  const files=(await readdir(directory)).filter(f=>/^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort();assert.ok(files.length>0);
  const migrations=await Promise.all(files.map(async id=>{const sql=await readFile(new URL(id,directory),'utf8');return {id,checksum:createHash('sha256').update(sql).digest('hex'),up:async(tx:import('pg').PoolClient)=>{await tx.query(sql);}};}));
  await runMigrations(db,migrations);
  assert.deepEqual((await db.query(preservedQuery)).rows,before);
  const ledger=(await db.query('SELECT * FROM schema_migrations ORDER BY id')).rows;
  assert.deepEqual(ledger.map(row=>({id:row.id,checksum:row.checksum})),migrations.map(({id,checksum})=>({id,checksum})));
  await runMigrations(db,migrations);
  assert.deepEqual((await db.query(preservedQuery)).rows,before);
  assert.deepEqual((await db.query('SELECT * FROM schema_migrations ORDER BY id')).rows,ledger);
  if(database==='platform')assert.deepEqual((await db.query('SELECT event_id,version,status,summary,claim_token,usage FROM analysis_jobs')).rows,[{event_id:'legacy-event',version:17,status:'completed',summary:'preserve historical result',claim_token:null,usage:null}]);
 }finally{await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
