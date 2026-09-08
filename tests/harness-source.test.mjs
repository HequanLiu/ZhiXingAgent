import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessSource } from '../apps/zhixing-harness/source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('Harness defaults to the source shipped inside the repository', () => {
  assert.equal(harnessSource({}), resolve(root, 'apps/zhixing-harness/upstream'));
});
test('Harness resolves relative overrides against the project, independent of cwd', () => {
  assert.equal(harnessSource({ SOUNDLAB_HARNESS_SOURCE: 'custom/harness' }), resolve(root, 'custom/harness'));
  assert.equal(harnessSource({ SOUNDLAB_HARNESS_SOURCE: resolve(root, 'external') }), resolve(root, 'external'));
});
