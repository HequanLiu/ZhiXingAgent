import {Pool} from 'pg';
import {migrateAuth,provisionUser} from '../apps/platform-api/auth.ts';
const db=new Pool({connectionString:process.env.PLATFORM_DATABASE_URL??'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform'});
try {
 await migrateAuth(db);
 await provisionUser(db,{tenant:process.env.SOUNDLAB_USER_TENANT??'',username:process.env.SOUNDLAB_USER_NAME??'',actor:process.env.SOUNDLAB_USER_ACTOR??'',password:process.env.SOUNDLAB_USER_PASSWORD??''});
 console.log('User provisioned. No credentials printed.');
}catch{console.error('Provisioning failed: require tenant, username, actor and password of 12–256 characters; existing usernames cannot be overwritten.');process.exitCode=1;}finally{await db.end();}
