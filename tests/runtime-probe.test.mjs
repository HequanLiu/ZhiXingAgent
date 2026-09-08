import test from 'node:test';
import assert from 'node:assert/strict';
import { runProbe, childEnvironment } from '../scripts/lib/runtime-probe.mjs';

test('live MiniMax receives only selected provider credential; handshake receives none', () => {
  const parent = { PATH:'bin', MINIMAX_API_KEY:'minimax-test', DEEPSEEK_API_KEY:'deepseek-test' };
  assert.equal(childEnvironment(parent, true, 'MINIMAX_API_KEY').MINIMAX_API_KEY, 'minimax-test');
  assert.equal(childEnvironment(parent, true, 'MINIMAX_API_KEY').DEEPSEEK_API_KEY, undefined);
  assert.equal(childEnvironment(parent, false, 'MINIMAX_API_KEY').MINIMAX_API_KEY, undefined);
});

test('initialization probe always closes the runtime without sending a prompt', async () => {
  const calls = [];
  await runProbe({ start: async () => calls.push('start'), close: async () => calls.push('close') });
  assert.deepEqual(calls, ['start', 'close']);
});

test('initialization failure closes the runtime and preserves the error', async () => {
  let closed = false;
  await assert.rejects(runProbe({ start: async () => { throw new Error('handshake failed'); }, close: async () => { closed = true; } }), /handshake failed/);
  assert.equal(closed, true);
});

test('child environment excludes unrelated secrets and includes key only for live mode', () => {
  const parent = { PATH: 'bin', SystemRoot: 'Windows', DEEPSEEK_API_KEY: 'test-secret', DATABASE_URL: 'private', DSH_HOME: 'other-home' };
  assert.deepEqual(childEnvironment(parent, false), { PATH: 'bin', SystemRoot: 'Windows' });
  assert.equal(childEnvironment(parent, true).DEEPSEEK_API_KEY, 'test-secret');
  assert.equal(childEnvironment(parent, true).DATABASE_URL, undefined);
});
