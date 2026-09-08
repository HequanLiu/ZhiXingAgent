import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrders, applyFeedback, assignOwner, orderProgress } from './helpers/domain.ts';
test('24 orders; assembly progress is not total order progress', () => {
  const orders = createOrders();
  assert.equal(orders.length, 24);
  const order = orders[0];
  const updated = applyFeedback(order, { nodeId: 'assembly', completed: 13, total: 20, blocker: '网罩到料待核实', expectedVersion: order.version }, 'zhao');
  assert.equal(updated.nodes[3].percent, 65);
  assert.notEqual(orderProgress(updated), 65);
  assert.equal(updated.nodes[3].status, 'blocked');
  assert.equal(updated.forecast, null);
});
test('feedback enforces owner, version and quantities', () => {
  const order = createOrders()[0];
  const input = { nodeId: 'assembly', completed: 13, total: 20, expectedVersion: order.version };
  assert.throws(() => applyFeedback(order, input, 'zhou'), /FORBIDDEN/);
  assert.throws(() => applyFeedback(order, { ...input, expectedVersion: 0 }, 'zhao'), /VERSION_CONFLICT/);
  assert.throws(() => applyFeedback(order, { ...input, completed: 21 }, 'zhao'), /VALIDATION_ERROR/);
  assert.throws(() => applyFeedback(order, { ...input, completed: -1 }, 'zhao'), /VALIDATION_ERROR/);
});
test('reported complete does not grant acceptance and accepted node cannot be overwritten', () => {
  const order = createOrders()[0];
  const updated = applyFeedback(order, { nodeId: 'assembly', completed: 20, total: 20, expectedVersion: 1 }, 'zhao');
  assert.equal(updated.nodes[3].status, 'reported_complete');
  assert.throws(() => applyFeedback(order, { nodeId: 'requirements', completed: 1, total: 1, expectedVersion: 1 }, 'chen'), /NODE_CLOSED/);
});
test('assignment is manager-only and validates new owner', () => {
  const order = createOrders()[0];
  assert.throws(() => assignOwner(order, 'assembly', 'zhou', 1, 'zhao'), /FORBIDDEN/);
  assert.throws(() => assignOwner(order, 'assembly', 'unknown', 1, 'chen'), /VALIDATION_ERROR/);
  assert.equal(assignOwner(order, 'assembly', 'zhou', 1, 'chen').nodes[3].owner, 'zhou');
});
