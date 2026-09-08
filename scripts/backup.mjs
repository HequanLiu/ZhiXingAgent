import {spawn} from 'node:child_process';import {mkdir,writeFile,stat} from 'node:fs/promises';import {createWriteStream} from 'node:fs';import {pipeline} from 'node:stream/promises';import {resolve} from 'node:path';
const container=process.env.SOUNDLAB_DB_CONTAINER??'soundlab-dev-postgres-1';
if(!/^[A-Za-z0-9_.-]+$/.test(container))throw new Error('Invalid container name');
const directory=resolve('.runtime/backups',new Date().toISOString().replaceAll(':','-'));
await mkdir(directory,{recursive:true});const files=[];
for(const name of ['soundlab_business','soundlab_platform']){
 const file=resolve(directory,name+'.dump');const child=spawn('docker',['exec',container,'pg_dump','-U',name,'-d',name,'--format=custom'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 const completion=new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolveExit(null):reject(new Error('Database backup failed')));});
 child.stderr.resume();await Promise.all([pipeline(child.stdout,createWriteStream(file,{flags:'wx'})),completion]);files.push({database:name,bytes:(await stat(file)).size});
}
await writeFile(resolve(directory,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),format:'pg-custom',files},null,2));
console.log(JSON.stringify({backupDirectory:directory,files}));
