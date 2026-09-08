import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, providerPatch } from '../scripts/lib/model-route.mjs';

test('MiniMax M3 is default and route contains no secret value', () => {
  const route = resolveRoute({});
  assert.equal(route.model, 'MiniMax-M3');
  assert.equal(route.keyEnv, 'MINIMAX_API_KEY');
  assert.equal(route.provider, 'soundlab-minimax');
  assert.equal(providerPatch(route)[0].insert[0].config.providers[route.provider].apiKeyEnv, 'MINIMAX_API_KEY');
});
test('switch provider explicitly without changing the scenario', () => {
  const route = resolveRoute({ SOUNDLAB_MODEL_ROUTE: 'deepseek' });
  assert.equal(route.provider, 'deepseek-official');
  assert.deepEqual(providerPatch(route), []);
});
test('unknown route fails rather than silently falling back', () => {
  assert.throws(() => resolveRoute({ SOUNDLAB_MODEL_ROUTE: 'typo' }), /Unknown model route/);
});
