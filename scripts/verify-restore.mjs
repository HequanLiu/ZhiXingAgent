import {spawn} from 'node:child_process';import {createReadStream} from 'node:fs';import {pipeline} from 'node:stream/promises';import {readdir,writeFile} from 'node:fs/promises';import {resolve,sep} from 'node:path';import {randomUUID} from 'node:crypto';
const root=resolve('.runtime/backups');const folders=(await readdir(root)).sort();const directory=resolve(root,process.argv[2]??folders.at(-1)??'');
if(!directory.startsWith(root+sep))throw new Error('Backup must be inside the workspace backup directory');
const container=process.env.SOUNDLAB_DB_CONTAINER??'soundlab-dev-postgres-1';if(!/^[A-Za-z0-9_.-]+$/.test(container))throw new Error('Invalid container');
async function run(args,input){const child=spawn('docker',['exec',...(input?['-i']:[]),container,...args],{stdio:[input?'pipe':'ignore','pipe','pipe'],windowsHide:true});let output='';child.stdout.on('data',b=>output+=b.toString());child.stderr.resume();const exit=new Promise((ok,no)=>{child.on('error',no);child.on('close',code=>code===0?ok():no(new Error('Restore verification command failed')));});await Promise.all([exit,...(input?[pipeline(createReadStream(input),child.stdin)]:[])]);return output.trim();}
const results=[];
for(const original of ['soundlab_business','soundlab_platform']){
 const database='soundlab_restore_test_'+randomUUID().replaceAll('-','');
 if(!/^soundlab_restore_test_[a-f0-9]{32}$/.test(database))throw new Error('Invalid temporary database');
 await run(['psql','-U','soundlab_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE DATABASE ${database}`]);
 try {
  await run(['pg_restore','-U','soundlab_admin','--no-owner','--exit-on-error','-d',database],resolve(directory,original+'.dump'));
  const table=original==='soundlab_business'?'orders':'analysis_jobs';const count=Number(await run(['psql','-U','soundlab_admin','-d',database,'-At','-c',`SELECT count(*) FROM ${table}`]));
  const ledger=JSON.parse(await run(['psql','-U','soundlab_admin','-d',database,'-At','-c',`SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM schema_migrations`]));
  const members=original==='soundlab_platform'?Number(await run(['psql','-U','soundlab_admin','-d',database,'-At','-c','SELECT count(*) FROM tenant_members'])):undefined;
  results.push({database:original,restored:true,checkedTable:table,rows:count,migrations:ledger,...(members===undefined?{}:{members})});
 }finally{await run(['psql','-U','soundlab_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c',`DROP DATABASE ${database}`]);}
}
await writeFile(resolve(directory,'restore-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),results},null,2));console.log(JSON.stringify({backupDirectory:directory,results}));
