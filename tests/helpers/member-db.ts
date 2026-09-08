import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';
import {testMembers} from './members.ts';
export async function seedTestMembers(db:Pool){
 const schema=(await db.query('SELECT current_schema() AS name')).rows[0].name;
 if(!schema.startsWith('test_'))throw new Error('Test member fixtures require an isolated test schema');
 await db.query(await readFile(new URL('../../migrations/platform/005-members.sql',import.meta.url),'utf8').catch(()=>readFile(new URL('../../../migrations/platform/005-members.sql',import.meta.url),'utf8')));
 for(const tenant of ['a','b','demo','other','one','two','t','test','tenant-a','tenant-b','isolated-tenant','claim-tenant'])for(const m of testMembers(tenant))await db.query('INSERT INTO tenant_members VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[m.tenant,m.actor,m.displayName,m.role,m.enabled,m.version]);
}
