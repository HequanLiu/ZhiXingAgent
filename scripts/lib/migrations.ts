import type {Pool,PoolClient} from 'pg';
export interface Migration {id:string;checksum:string;up:(tx:PoolClient)=>Promise<void>}
export async function runMigrations(db:Pool,migrations:Migration[]) {
 if(migrations.some((m,i)=>!m.id||!m.checksum||(i>0&&m.id<=migrations[i-1].id)))throw new Error('INVALID_MIGRATION_SEQUENCE');
 const tx=await db.connect();
 try {
  await tx.query('BEGIN');
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database()||':'||current_schema()||':migrations',0))");
  await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations(id text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const applied=(await tx.query('SELECT id,checksum FROM schema_migrations ORDER BY id')).rows;
  for(const [index,row] of applied.entries()){const candidate=migrations[index];if(!candidate||candidate.id!==row.id||candidate.checksum!==row.checksum)throw new Error('MIGRATION_HISTORY_CHANGED');}
  for(const migration of migrations){if(applied.some(r=>r.id===migration.id))continue;await migration.up(tx);await tx.query('INSERT INTO schema_migrations(id,checksum) VALUES($1,$2)',[migration.id,migration.checksum]);}
  await tx.query('COMMIT');
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
