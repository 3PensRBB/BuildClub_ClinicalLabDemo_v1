'use strict';

const { resolveCoverage } = require('./resolver');

const POLICY_MINUTES = 30;
const TARGET_LABEL = { primary: 'covering clinician', backup: 'backup', chargeNurse: 'charge nurse' };

// Minutes after the result posts, if nobody has acknowledged it yet.
const LADDER = [
  { atMin: 10, step: 1, label: 'Notify backup' },
  { atMin: 20, step: 2, label: 'Notify charge nurse and lab supervisor' },
  { atMin: 25, step: 3, label: 'Red flag: call the attending directly' },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** True when a number in the read-back text equals the result value. */
function readBackMatches(text, value) {
  const want = Number(String(value).replace(/,/g, ''));
  const nums = String(text || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/g) || [];
  return nums.some((n) => Number(n) === want);
}

function createStore(seed, clock) {
  let results;
  let notifications;
  let seq;

  function reset() {
    results = [];
    notifications = [];
    seq = 0;
  }
  reset();

  const nextId = (prefix) => `${prefix}${++seq}`;
  const nowIso = () => clock.now().toISOString();
  const minutesBetween = (fromIso, toMs) => (toMs - Date.parse(fromIso)) / 60000;
  const clinicianName = (id) => (seed.clinicians.find((c) => c.id === id) || { name: id }).name;

  function getResult(id) {
    const r = results.find((x) => x.id === id);
    if (!r) throw new HttpError(404, 'Result not found');
    return r;
  }
  function getNotification(id) {
    const n = notifications.find((x) => x.id === id);
    if (!n) throw new HttpError(404, 'Notification not found');
    return n;
  }
  const log = (r, type, text) => r.events.push({ at: nowIso(), type, text });
  const coverage = (r) => resolveCoverage(seed, r.mrn, clock.now(), r.orderedBy);

  function postResult(scenarioKey) {
    const tpl = seed.scenarios[scenarioKey];
    if (!tpl) throw new HttpError(404, `Unknown scenario ${scenarioKey}`);
    const r = {
      id: nextId('R'),
      scenario: scenarioKey,
      ...tpl.result,
      resultedAt: nowIso(),
      status: 'open', // open -> acknowledged -> closed
      escalationStep: 0,
      supervisorAlerted: false,
      redFlag: false,
      breached: false,
      ack: null,
      closedAt: null,
      events: [],
    };
    log(r, 'result', `Critical result posted: ${r.test} ${r.value} ${r.units} (${r.flag})`);
    results.unshift(r);
    return r;
  }

  /** Sends to a contact once per result; returns null if they were already contacted. */
  function send(r, contact, target, { channel = 'message', auto = false } = {}) {
    if (!contact) return null;
    const who = contact.clinician.id;
    if (notifications.some((n) => n.resultId === r.id && n.recipientId === who)) return null;
    const n = {
      id: nextId('N'),
      resultId: r.id,
      recipientId: who,
      target,
      reason: contact.reason,
      channel,
      auto,
      sentAt: nowIso(),
      status: 'sent', // sent -> acknowledged | superseded | rejected
      ackAt: null,
    };
    notifications.push(n);
    const verb = channel === 'call' ? 'Called' : 'Secure message sent to';
    log(r, auto ? 'escalation' : 'notify', `${auto ? 'Auto-escalation: ' : ''}${verb} ${contact.clinician.name} (${TARGET_LABEL[target]})`);
    return n;
  }

  function notify(resultId, { target = 'primary', channel = 'message' } = {}) {
    const r = getResult(resultId);
    if (r.status !== 'open') throw new HttpError(409, 'Result is already acknowledged');
    if (!['primary', 'backup', 'chargeNurse'].includes(target)) throw new HttpError(400, 'Unknown target');
    if (!['message', 'call'].includes(channel)) throw new HttpError(400, 'Unknown channel');
    const contact = coverage(r)[target];
    if (!contact) throw new HttpError(409, `No ${target} found for this patient right now`);
    const n = send(r, contact, target, { channel });
    if (!n) throw new HttpError(409, `${contact.clinician.name} was already contacted for this result`);
    return n;
  }

  function acknowledge(notificationId, { readBack = '' } = {}) {
    const n = getNotification(notificationId);
    const r = getResult(n.resultId);
    if (n.status !== 'sent' || r.status !== 'open') throw new HttpError(409, 'This alert is no longer open');
    if (!String(readBack).trim()) throw new HttpError(400, 'Read back the value to acknowledge');
    const now = clock.now();
    n.status = 'acknowledged';
    n.ackAt = now.toISOString();
    for (const other of notifications) {
      if (other.resultId === r.id && other.status === 'sent') other.status = 'superseded';
    }
    r.status = 'acknowledged';
    r.ack = {
      by: n.recipientId,
      at: n.ackAt,
      readBack: String(readBack).slice(0, 200),
      matches: readBackMatches(readBack, r.value),
      minutesToAck: minutesBetween(r.resultedAt, now.getTime()),
    };
    log(r, 'ack', `${clinicianName(n.recipientId)} acknowledged. Read-back: "${r.ack.readBack}"${r.ack.matches ? '' : ' (does not match value)'}`);
    return n;
  }

  function close(resultId) {
    const r = getResult(resultId);
    if (r.status !== 'acknowledged') throw new HttpError(409, 'A clinician must acknowledge before closing');
    r.status = 'closed';
    r.closedAt = nowIso();
    log(r, 'closed', 'Lab tech verified the read-back. Result closed.');
    return r;
  }

  function wrongPerson(notificationId, { reason = '' } = {}) {
    const n = getNotification(notificationId);
    const r = getResult(n.resultId);
    if (n.status !== 'sent' || r.status !== 'open') throw new HttpError(409, 'This alert is no longer open');
    n.status = 'rejected';
    n.rejectReason = String(reason || 'Not covering this patient').slice(0, 200);
    log(r, 'rerouted', `${clinicianName(n.recipientId)} marked "wrong person": ${n.rejectReason}`);
    const cov = coverage(r);
    for (const target of ['primary', 'backup', 'chargeNurse']) {
      if (send(r, cov[target], target, { auto: true })) return n;
    }
    r.redFlag = true;
    log(r, 'red', 'No remaining contacts. Call the attending directly.');
    return n;
  }

  /** Runs the escalation ladder. Returns true if anything changed. */
  function tick() {
    const t = clock.now().getTime();
    let changed = false;
    for (const r of results) {
      if (r.status !== 'open') continue;
      const m = minutesBetween(r.resultedAt, t);
      for (const rung of LADDER) {
        if (r.escalationStep >= rung.step || m < rung.atMin) continue;
        r.escalationStep = rung.step;
        changed = true;
        const cov = coverage(r);
        if (rung.step === 1) {
          send(r, cov.primary, 'primary', { auto: true });
          send(r, cov.backup, 'backup', { auto: true });
        } else if (rung.step === 2) {
          send(r, cov.chargeNurse, 'chargeNurse', { auto: true });
          r.supervisorAlerted = true;
          log(r, 'escalation', 'Lab supervisor alerted: 20 minutes without acknowledgment');
        } else {
          r.redFlag = true;
          log(r, 'red', 'RED FLAG: 25 minutes without acknowledgment. Call the attending directly.');
        }
      }
      if (!r.breached && m >= POLICY_MINUTES) {
        r.breached = true;
        changed = true;
        log(r, 'breach', `Policy breach: no acknowledgment within ${POLICY_MINUTES} minutes`);
      }
    }
    return changed;
  }

  function snapshot() {
    const now = clock.now();
    return {
      now: now.toISOString(),
      policyMinutes: POLICY_MINUTES,
      ladder: LADDER,
      scenarios: Object.fromEntries(Object.entries(seed.scenarios).map(([k, v]) => [k, v.title])),
      clinicians: seed.clinicians,
      results: results.map((r) => ({
        ...r,
        coverage: coverage(r),
        notifications: notifications.filter((n) => n.resultId === r.id),
        deadline: new Date(Date.parse(r.resultedAt) + POLICY_MINUTES * 60000).toISOString(),
      })),
    };
  }

  return { reset, postResult, notify, acknowledge, close, wrongPerson, tick, snapshot };
}

module.exports = { createStore, HttpError, readBackMatches, POLICY_MINUTES, LADDER };
