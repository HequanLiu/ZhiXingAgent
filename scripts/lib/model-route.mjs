const routes = {
  minimax: { provider: 'soundlab-minimax', model: 'MiniMax-M3', keyEnv: 'MINIMAX_API_KEY', baseURL: 'https://api.minimax.cn/v1' },
  deepseek: { provider: 'deepseek-official', model: 'deepseek-v4-flash', keyEnv: 'DEEPSEEK_API_KEY' },
};
export function resolveRoute(env) {
  const name = env.SOUNDLAB_MODEL_ROUTE ?? 'minimax';
  if (!Object.hasOwn(routes, name)) throw new Error('Unknown model route');
  const route = { ...routes[name] };
  if (env.SOUNDLAB_MODEL_ID !== undefined) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(env.SOUNDLAB_MODEL_ID)) throw new Error('MODEL_CONFIGURATION_INVALID');
    route.model = env.SOUNDLAB_MODEL_ID;
  }
  if (env.SOUNDLAB_MODEL_BASE_URL !== undefined) {
    try {
      const url = new URL(env.SOUNDLAB_MODEL_BASE_URL);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
      route.baseURL = url.href.replace(/\/$/, '');
    } catch { throw new Error('MODEL_CONFIGURATION_INVALID'); }
  }
  return route;
}
export function providerPatch(route) {
  if (route.provider === 'deepseek-official') return route.baseURL ? [{id:'llm-deepseek',config:{baseURL:route.baseURL,apiKeyEnv:route.keyEnv}}] : [];
  return [{ insert: [{ id: 'soundlab-model-provider', name: '@deepseek-ai/dsh-llm-pi-ai', config: {
    providers: { [route.provider]: {
      displayName: 'MiniMax', apiKeyEnv: route.keyEnv, api: 'openai-completions', baseURL: route.baseURL,
      models: [{ id: route.model, contextWindow: 1000000 }],
      retryPolicy: { mode: 'normal', maxRetries: 0 },
    } },
  } }] }];
}

