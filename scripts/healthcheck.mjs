const checks=await Promise.all([['web','http://127.0.0.1:5179/'],['platform','http://127.0.0.1:4310/health'],['business','http://127.0.0.1:4311/health'],['worker','http://127.0.0.1:4310/health/ready']].map(async([name,url])=>{
 try{const response=await fetch(url,{signal:AbortSignal.timeout(3000)});if(!response.ok)return {name,ready:false};if(name==='worker'){const data=await response.json();return {name,ready:data.status==='ready'};}return {name,ready:true};}catch{return {name,ready:false};}
}));
console.log(JSON.stringify({checkedAt:new Date().toISOString(),ready:checks.every(c=>c.ready),checks}));
if(checks.some(c=>!c.ready))process.exitCode=1;
