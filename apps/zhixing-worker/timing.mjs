export function workerTiming(env=process.env) {
  const analysisIntervalMs=env.SOUNDLAB_ANALYSIS_INTERVAL_MS===undefined?5000:Number(env.SOUNDLAB_ANALYSIS_INTERVAL_MS);
  if(!Number.isSafeInteger(analysisIntervalMs)||analysisIntervalMs<1000||analysisIntervalMs>3600000)throw new Error('INVALID_WORKER_INTERVAL: SOUNDLAB_ANALYSIS_INTERVAL_MS must be 1000..3600000');
  return {eventPollMs:1500,analysisIntervalMs};
}
