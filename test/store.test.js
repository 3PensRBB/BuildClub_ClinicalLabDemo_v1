'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const seed = require('../data/seed.json');
const { createStore, readBackMatches } = require('../src/store');

function fixedClock(iso) {
  let t = Date.parse(iso);
  return { now: () => new Date(t), advance: (m) => (t += m * 60000) };
}

function setup() {
  const clock = fixedClock('2026-11-24T19:42:00Z');
  return { clock, store: createStore(seed, clock) };
}

const view = (store, id) => store.snapshot().results.find((r) => r.id === id);

test('happy path: notify covering clinician, acknowledge with read-back, close', () => {
  const { clock, store } = setup();
  const r = store.postResult('A');
  const n = store.notify(r.id);
  assert.equal(n.recipientId, 'nguyen');
  clock.advance(3);
  store.acknowledge(n.id, { readBack: 'K 6.8, will treat' });
  const v = view(store, r.id);
  assert.equal(v.status, 'acknowledged');
  assert.equal(v.ack.matches, true);
  assert.equal(v.ack.minutesToAck, 3);
  store.close(r.id);
  assert.equal(view(store, r.id).status, 'closed');
});

test('cannot close before acknowledgment, and read-back is required', () => {
  const { store } = setup();
  const r = store.postResult('A');
  assert.throws(() => store.close(r.id), /acknowledge/);
  const n = store.notify(r.id);
  assert.throws(() => store.acknowledge(n.id, { readBack: '' }), /Read back/);
});

test('escalation ladder fires at 10, 20 and 25 minutes, then flags a breach at 30', () => {
  const { clock, store } = setup();
  const r = store.postResult('B');
  store.notify(r.id);

  clock.advance(10);
  store.tick();
  let v = view(store, r.id);
  assert.deepEqual(v.notifications.map((n) => n.recipientId), ['kim', 'okafor']);

  clock.advance(10);
  store.tick();
  v = view(store, r.id);
  assert.equal(v.supervisorAlerted, true);
  assert.ok(v.notifications.some((n) => n.recipientId === 'chen'));

  clock.advance(5);
  store.tick();
  assert.equal(view(store, r.id).redFlag, true);

  clock.advance(5);
  store.tick();
  assert.equal(view(store, r.id).breached, true);
});

test('acknowledgment stops escalation and supersedes other open alerts', () => {
  const { clock, store } = setup();
  const r = store.postResult('B');
  store.notify(r.id);
  clock.advance(10);
  store.tick();
  const backup = view(store, r.id).notifications.find((n) => n.recipientId === 'okafor');
  store.acknowledge(backup.id, { readBack: 'troponin 1,250' });
  clock.advance(30);
  store.tick();
  const v = view(store, r.id);
  assert.equal(v.breached, false);
  assert.equal(v.escalationStep, 1);
  assert.equal(v.notifications.find((n) => n.recipientId === 'kim').status, 'superseded');
});

test('wrong person re-routes to the next contact', () => {
  const { store } = setup();
  const r = store.postResult('A');
  const n = store.notify(r.id);
  store.wrongPerson(n.id, { reason: 'Handed off' });
  const v = view(store, r.id);
  assert.equal(v.notifications[0].status, 'rejected');
  assert.equal(v.notifications[1].recipientId, 'okafor');
});

test('readBackMatches compares numbers, ignoring commas', () => {
  assert.equal(readBackMatches('K is 6.8', '6.8'), true);
  assert.equal(readBackMatches('1,250 ng/L', '1250'), true);
  assert.equal(readBackMatches('5.8', '6.8'), false);
});
