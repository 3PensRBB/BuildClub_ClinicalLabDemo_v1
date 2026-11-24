'use strict';

const { hhmm, within } = require('./time');

const ROLE_RANK = { procedure: 0, consult: 1 };

/**
 * Works out who is responsible for a patient at time `now`.
 *
 * Order of precedence:
 *   1. An active procedure or consult coverage window on the treatment team.
 *   2. The clinician on call (level 1) for the patient's primary service.
 * Backup = level 2 on call for the primary service (or the primary team's on-call
 * clinician when a procedure/consult team is covering). Charge nurse = by unit.
 */
function resolveCoverage(data, mrn, now, orderedById) {
  const t = now.getTime();
  const patient = data.patients.find((p) => p.mrn === mrn);
  if (!patient) throw new Error(`Unknown patient ${mrn}`);

  const clinician = (id) => data.clinicians.find((c) => c.id === id) || null;
  const serviceName = (s) => data.services[s] || s;
  const onCall = (service, level) =>
    data.callSchedule.find((c) => c.service === service && c.level === level && within(t, c.start, c.end));
  const contact = (entry, reason) => (entry ? { clinician: clinician(entry.clinicianId), reason } : null);

  const svc = patient.primaryService;
  const special = data.treatmentTeam
    .filter((e) => e.mrn === mrn && e.role in ROLE_RANK && within(t, e.start, e.end))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role])[0];

  let primary;
  let backup;
  if (special) {
    const kind = special.role === 'procedure' ? 'Procedure' : 'Consult';
    primary = contact(
      special,
      `${kind} coverage: ${special.note} (${hhmm(special.start)}–${hhmm(special.end)}) overrides the primary team`
    );
    const team = onCall(svc, 1);
    backup = contact(team, `Primary team on call: ${serviceName(svc)} (${team && hhmm(team.start)}–${team && hhmm(team.end)})`);
  } else {
    const p = onCall(svc, 1);
    primary = contact(p, p && `On call for ${serviceName(svc)} (${hhmm(p.start)}–${hhmm(p.end)})`);
    const b = onCall(svc, 2);
    backup = contact(b, b && `Backup on call for ${serviceName(svc)} (${hhmm(b.start)}–${hhmm(b.end)})`);
  }

  const nurseId = data.chargeNurses[patient.unit];
  const chargeNurse = nurseId ? { clinician: clinician(nurseId), reason: `Charge nurse, unit ${patient.unit}` } : null;

  // How the ordering provider relates to current coverage.
  let ordering = null;
  if (orderedById) {
    const shifts = data.callSchedule.filter((c) => c.clinicianId === orderedById);
    const onShiftNow = shifts.some((c) => within(t, c.start, c.end));
    const ended = shifts
      .filter((c) => Date.parse(c.end) <= t)
      .sort((a, b) => Date.parse(b.end) - Date.parse(a.end))[0];
    ordering = {
      clinician: clinician(orderedById),
      covering: !!primary && primary.clinician.id === orderedById,
      onShift: onShiftNow,
      offShiftSince: !onShiftNow && ended ? ended.end : null,
    };
  }

  return {
    patient: { ...patient, primaryServiceName: serviceName(svc) },
    primary,
    backup,
    chargeNurse,
    ordering,
  };
}

module.exports = { resolveCoverage };
