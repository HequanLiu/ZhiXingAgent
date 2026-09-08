import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const env={...process.env,SOUNDLAB_DEMO_MODE:process.env.SOUNDLAB_DEMO_MODE??'true',SOUNDLAB_READ_TOKEN:randomBytes(32).toString('hex'),BUSINESS_BRIDGE_KEY:randomBytes(24).toString('hex')};
const publicProcessEnv={...env};
delete publicProcessEnv.MINIMAX_API_KEY;
delete publicProcessEnv.DEEPSEEK_API_KEY;
const frontendEnv={...publicProcessEnv};
for(const key of Object.keys(frontendEnv))if(key.startsWith('WECOM_')||['SOUNDLAB_CHANNEL_SECRET','SOUNDLAB_USER_PASSWORD'].includes(key))delete frontendEnv[key];
const files=['apps/sample-reference-service/server.ts','apps/zhixing-api/server.ts','apps/zhixing-worker/server.ts'];
const children=files.map(file=>spawn(process.execPath,['--import','tsx',file],{env:file==='apps/zhixing-worker/server.ts'?env:publicProcessEnv,stdio:'inherit',windowsHide:true}));
children.push(spawn(process.execPath,env.SOUNDLAB_SERVE_BUILD==='true'?['--import','tsx','scripts/serve-web.ts']:['node_modules/vite/bin/vite.js','--config','apps/web/vite.config.ts'],{env:frontendEnv,stdio:'inherit',windowsHide:true}));
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
for(const child of children)child.on('exit',code=>{if(!stopping)stop(code??1);});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
