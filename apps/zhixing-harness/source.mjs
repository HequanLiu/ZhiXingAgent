import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function harnessSource(env = process.env) {
  return resolve(root, env.SOUNDLAB_HARNESS_SOURCE ?? 'apps/zhixing-harness/upstream');
}
