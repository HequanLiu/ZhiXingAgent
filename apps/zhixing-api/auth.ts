import {resolveMember} from './members.ts';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {Principal} from '../../packages/platform-contracts/index.ts';
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function migrateAuth(db:Pool){await db.query(`CREATE TABLE IF NOT EXISTS auth_users(tenant text NOT NULL,username text NOT NULL,actor text NOT NULL,salt text NOT NULL,password_hash text NOT NULL,enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(tenant,username));
 CREATE TABLE IF NOT EXISTS auth_sessions(token_hash text PRIMARY KEY,tenant text NOT NULL,username text NOT NULL,expires_at timestamptz NOT NULL,FOREIGN KEY(tenant,username) REFERENCES auth_users(tenant,username));`);}
export async function provisionUser(db:Pool,input:{tenant:string;username:string;actor:string;password:string}) {
 if(!input||![input.tenant,input.username,input.actor].every(v=>typeof v==='string'&&/^[\w-]{1,60}$/.test(v))||typeof input.password!=='string'||input.password.length<12||input.password.length>256)throw new Error('VALIDATION_ERROR');
 await resolveMember(db,input);
 const salt=randomBytes(32).toString('hex');const digest=scryptSync(input.password,salt,64).toString('hex');
 // Provisioning is CLI-only; it never silently overwrites an existing identity or password.
 await db.query('INSERT INTO auth_users(tenant,username,actor,salt,password_hash) VALUES($1,$2,$3,$4,$5)',[input.tenant,input.username,input.actor,salt,digest]);
}
export async function login(db:Pool,input:{tenant:string;username:string;password:string}):Promise<{token:string;principal:Principal}> {
 if(!input||typeof input.tenant!=='string'||input.tenant.length>60||typeof input.username!=='string'||input.username.length>60||typeof input.password!=='string'||input.password.length>256)throw new Error('UNAUTHORIZED');
 const user=(await db.query('SELECT * FROM auth_users WHERE tenant=$1 AND username=$2 AND enabled=true',[input.tenant,input.username])).rows[0];
 const digest=scryptSync(input.password,user?.salt??'invalid-user-salt',64);const expected=user?Buffer.from(user.password_hash,'hex'):Buffer.alloc(64);
 if(!timingSafeEqual(digest,expected)||!user)throw new Error('UNAUTHORIZED');
 const principal=await resolveMember(db,{tenant:user.tenant,actor:user.actor});
 const token=randomBytes(32).toString('hex');
 await db.query("INSERT INTO auth_sessions VALUES($1,$2,$3,now()+interval '12 hours')",[hash(token),input.tenant,input.username]);
 return {token,principal};
}
export async function authenticate(db:Pool,token:string):Promise<Principal> {
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new Error('UNAUTHORIZED');
 const row=(await db.query('SELECT u.tenant,u.actor FROM auth_sessions s JOIN auth_users u USING(tenant,username) WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled=true',[hash(token)])).rows[0];
 if(!row)throw new Error('UNAUTHORIZED');return resolveMember(db,row);
}
export async function logout(db:Pool,token:string){await db.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hash(token)]);}
export function sessionToken(cookie:unknown){if(typeof cookie!=='string')return '';return cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('soundlab_session='))?.slice(17)??'';}
