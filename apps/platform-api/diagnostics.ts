import type {Pool} from 'pg';
export async function diagnostics(db:Pool,tenant:string){
 const worker=(await db.query("SELECT heartbeat_at>now()-interval '15 seconds' AS online,enabled FROM worker_status WHERE name='analysis'")).rows[0];
 const queue=(await db.query("SELECT count(*) FILTER(WHERE status='failed')::int AS failed,count(*) FILTER(WHERE status='running' AND updated_at<now()-interval '15 minutes')::int AS stalled FROM analysis_jobs WHERE tenant=$1",[tenant])).rows[0];
 const alerts:{code:string;severity:'warning'|'error';message:string}[]=[];
 if(!worker?.online)alerts.push({code:'WORKER_OFFLINE',severity:'error',message:'后台心跳中断，请检查 Worker 进程及数据库连接'});
 if(queue.failed)alerts.push({code:'ANALYSIS_FAILED',severity:'warning',message:`${queue.failed} 项分析失败，可查看原因并人工重试`});
 if(queue.stalled)alerts.push({code:'ANALYSIS_STALLED',severity:'error',message:`${queue.stalled} 项运行超过 15 分钟，请检查运行日志和任务认领`});
 return {checkedAt:new Date().toISOString(),status:alerts.some(a=>a.severity==='error')?'unhealthy':alerts.length?'degraded':'healthy',workerOnline:!!worker?.online,modelEnabled:!!worker?.enabled,alerts};
}
