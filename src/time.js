'use strict';

// Demo times are stored as UTC ISO strings and shown as hospital-local HH:MM.
const hhmm = (iso) => new Date(iso).toISOString().slice(11, 16);

const within = (t, start, end) => t >= Date.parse(start) && t < Date.parse(end);

/** Simulated clock: runs at real speed from `startIso`, and can be fast-forwarded. */
function createClock(startIso) {
  let base = Date.parse(startIso);
  let realBase = Date.now();
  let offset = 0;
  return {
    now: () => new Date(base + (Date.now() - realBase) + offset),
    advance(minutes) {
      offset += minutes * 60000;
    },
    reset() {
      base = Date.parse(startIso);
      realBase = Date.now();
      offset = 0;
    },
  };
}

module.exports = { hhmm, within, createClock };
