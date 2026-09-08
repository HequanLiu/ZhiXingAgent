export function childEnvironment(parent, live, keyEnv = 'DEEPSEEK_API_KEY') {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'];
  if (live && ['MINIMAX_API_KEY', 'DEEPSEEK_API_KEY'].includes(keyEnv)) allowed.push(keyEnv);
  if(live)allowed.push('SOUNDLAB_READ_TOKEN');
  return Object.fromEntries(allowed.filter(key => parent[key] !== undefined).map(key => [key, parent[key]]));
}

export async function runProbe(harness) {
  try {
    await harness.start();
    return { initialized: true, modelRequestSent: false };
  } finally {
    await harness.close();
  }
}
