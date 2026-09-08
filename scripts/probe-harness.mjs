import { harnessSource } from '../apps/zhixing-harness/source.mjs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { runProbe, childEnvironment } from './lib/runtime-probe.mjs';
import { resolveRoute, providerPatch } from './lib/model-route.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = harnessSource();
const { DeepSeekHarness } = await import(pathToFileURL(resolve(source, 'packages/sdk/client/lib/index.js')).href);
const home = resolve(root, '.runtime/harness-probe');
await mkdir(home, { recursive: true });
const route = resolveRoute(process.env);
const routeFile = resolve(home, 'model-route.patch.yml');
await writeFile(routeFile, JSON.stringify(providerPatch(route), null, 2));
const harness = new DeepSeekHarness({
  profile: 'sdk-minimal',
  dshHome: home,
  cwd: root,
  processCwd: source,
  patches: [resolve(root, 'apps/zhixing-harness/probe.patch.yml'), routeFile],
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
