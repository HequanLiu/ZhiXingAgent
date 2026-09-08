import {Pool} from 'pg';
import {saveMember} from '../apps/zhixing-api/members.ts';
const db=new Pool({connectionString:process.env.PLATFORM_DATABASE_URL??'postgresql://soundlab_platform:platform-local-only@127.0.0.1:55439/soundlab_platform'});
try{const tenant=process.env.SOUNDLAB_USER_TENANT??'',actor=process.env.SOUNDLAB_USER_ACTOR??'';await saveMember(db,{tenant,actor},actor,{displayName:process.env.SOUNDLAB_MEMBER_NAME??'',role:'manager',enabled:true,expectedVersion:0},true);console.log('Initial manager created. Provision login credentials separately.');}catch{console.error('Bootstrap requires an empty tenant and a valid actor/display name. Existing memberships are never overwritten.');process.exitCode=1;}finally{await db.end();}
