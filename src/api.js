'use strict';

const { HttpError } = require('./store');

/**
 * The demo's POST API, independent of transport. Used by the Node server and by the
 * standalone single-file build, where it runs in the browser.
 * Returns post(pathname, body) -> result, throwing HttpError on bad requests.
 */
function createApi(store, clock) {
  const routes = [
    [/^\/api\/results$/, (_, b) => store.postResult(b.scenario)],
    [/^\/api\/results\/(\w+)\/notify$/, ([id], b) => store.notify(id, b)],
    [/^\/api\/results\/(\w+)\/close$/, ([id]) => store.close(id)],
    [/^\/api\/notifications\/(\w+)\/ack$/, ([id], b) => store.acknowledge(id, b)],
    [/^\/api\/notifications\/(\w+)\/wrong-person$/, ([id], b) => store.wrongPerson(id, b)],
    [/^\/api\/clock\/advance$/, (_, b) => {
      const minutes = Number(b.minutes);
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 120) throw new HttpError(400, 'minutes must be 1–120');
      clock.advance(minutes);
      return { ok: true };
    }],
    [/^\/api\/reset$/, () => {
      clock.reset();
      store.reset();
      return { ok: true };
    }],
  ];

  return function post(pathname, body = {}) {
    for (const [pattern, handler] of routes) {
      const m = pathname.match(pattern);
      if (!m) continue;
      const result = handler(m.slice(1), body || {});
      store.tick();
      return result;
    }
    throw new HttpError(404, 'Not found');
  };
}

module.exports = { createApi };
