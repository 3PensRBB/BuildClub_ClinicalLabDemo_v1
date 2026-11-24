'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const seed = require('../data/seed.json');
const { resolveCoverage } = require('../src/resolver');

const at = (iso) => new Date(iso);

test('Scenario A: night cross-cover covers, day ordering provider is flagged off shift', () => {
  const cov = resolveCoverage(seed, '100234', at('2026-11-24T19:42:00Z'), 'patel');
  assert.equal(cov.primary.clinician.id, 'nguyen');
  assert.equal(cov.backup.clinician.id, 'okafor');
  assert.equal(cov.chargeNurse.clinician.id, 'lopez');
  assert.equal(cov.ordering.covering, false);
  assert.equal(cov.ordering.offShiftSince, '2026-11-24T19:00:00Z');
});

test('Scenario A during the day: the ordering provider is also covering', () => {
  const cov = resolveCoverage(seed, '100234', at('2026-11-24T10:00:00Z'), 'patel');
  assert.equal(cov.primary.clinician.id, 'patel');
  assert.equal(cov.backup.clinician.id, 'hale');
  assert.equal(cov.ordering.covering, true);
  assert.equal(cov.ordering.offShiftSince, null);
});

test('Scenario B: ordering provider is on call and covering', () => {
  const cov = resolveCoverage(seed, '100587', at('2026-11-24T19:45:00Z'), 'kim');
  assert.equal(cov.primary.clinician.id, 'kim');
  assert.equal(cov.ordering.covering, true);
});

test('Scenario C: procedure coverage overrides the primary team', () => {
  const cov = resolveCoverage(seed, '100912', at('2026-11-24T19:45:00Z'), 'brooks');
  assert.equal(cov.primary.clinician.id, 'shah');
  assert.match(cov.primary.reason, /Procedure coverage/);
  assert.equal(cov.backup.clinician.id, 'kim');
  assert.equal(cov.chargeNurse.clinician.id, 'chen');
});

test('Scenario C after the procedure window: primary team covers again', () => {
  const cov = resolveCoverage(seed, '100912', at('2026-11-24T22:30:00Z'), 'brooks');
  assert.equal(cov.primary.clinician.id, 'kim');
});

test('Unknown patient throws', () => {
  assert.throws(() => resolveCoverage(seed, 'nope', at('2026-11-24T19:45:00Z')));
});
