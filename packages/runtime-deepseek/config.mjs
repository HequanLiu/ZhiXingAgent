export function runtimeTimeouts(env) {
  const read=(key,fallback)=>{
    if(env[key]===undefined)return fallback;
    if(!/^\d+$/.test(env[key]))throw new Error('MODEL_CONFIGURATION_INVALID');
    const value=Number(env[key]);
    if(!Number.isSafeInteger(value)||value<1000||value>600000)throw new Error('MODEL_CONFIGURATION_INVALID');
    return value;
  };
  const initializeTimeoutMs=read('SOUNDLAB_MODEL_INITIALIZE_TIMEOUT_MS',30000);
  const requestTimeoutMs=read('SOUNDLAB_MODEL_REQUEST_TIMEOUT_MS',60000);
  const runTimeoutMs=read('SOUNDLAB_MODEL_RUN_TIMEOUT_MS',90000);
  if(runTimeoutMs<initializeTimeoutMs+requestTimeoutMs)throw new Error('MODEL_CONFIGURATION_INVALID');
  return {initializeTimeoutMs,requestTimeoutMs,runTimeoutMs};
}
