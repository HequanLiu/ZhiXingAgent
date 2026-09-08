import assert from 'node:assert/strict';
import test from 'node:test';
import {dateText, percentText, feedbackProgress, versionLabel, newestFirst} from '../apps/zhixing-web/src/evidence-presentation.ts';

test('missing dates and invalid ratios remain explicit without invented progress', () => {
  assert.equal(dateText(undefined), '待补充');
  assert.equal(dateText('bad date'), '待补充');
  assert.equal(percentText(NaN), '待补充');
  assert.equal(feedbackProgress({completed: 5, total: 0}), '已完成 5 / 0，比例待核实');
  assert.equal(feedbackProgress({completed: 3, total: 4}), '已完成 3 / 4 · 75%');
  assert.equal(feedbackProgress({completed: 35, total: 100, mode: 'percent'}), '已完成 35%');
});

test('unknown evidence versions never become current versions', () => {
  assert.equal(versionLabel(null, 8), '版本待核实');
  assert.equal(versionLabel(7, 8), '历史版本 v7');
  assert.equal(versionLabel(8, 8), '当前版本 v8');
  assert.equal(versionLabel(8, undefined), '查询版本 v8（当前版本待核实）');
});

test('feedback timeline sorts newest first without mutating the source', () => {
  const rows = [{at:'2026-09-01'}, {at:'2026-09-08'}, {at:''}];
  assert.deepEqual(newestFirst(rows).map(row => row.at), ['2026-09-08','2026-09-01','']);
  assert.equal(rows[0].at, '2026-09-01');
});
