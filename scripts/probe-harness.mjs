import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { runProbe, childEnvironment } from './lib/runtime-probe.mjs';
import { resolveRoute, providerPatch } from './lib/model-route.mjs';

const source = resolve(process.env.SOUNDLAB_HARNESS_SOURCE ?? '../harness-source');
const { DeepSeekHarness } = await import(pathToFileURL(resolve(source, 'packages/sdk/client/lib/index.js')).href);
const home = resolve('.runtime/harness-probe');
await mkdir(home, { recursive: true });
const route = resolveRoute(process.env);
const routeFile = resolve(home, 'model-route.patch.yml');
await writeFile(routeFile, JSON.stringify(providerPatch(route), null, 2));
const harness = new DeepSeekHarness({
  profile: 'sdk-minimal',
  dshHome: home,
  cwd: process.cwd(),
  processCwd: source,
  patches: [resolve('config/harness-probe.patch.yml'), routeFile],
  provider: route.provider,
  model: route.model,
  env: childEnvironment(process.env, false),
  initializeTimeoutMs: 30000,
  requestTimeoutMs: 30000,
});
try {
  console.log(JSON.stringify(await runProbe(harness)));
} catch (error) {
  console.error('Harness initialization failed:', error.message);
  process.exitCode = 1;
}
