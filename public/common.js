/* Shared helpers for all CritCall views. */
const CC = (() => {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const hhmm = (iso) => (iso ? new Date(iso).toISOString().slice(11, 16) : '');

  const mmss = (minutes) => {
    const neg = minutes < 0;
    const s = Math.abs(Math.round(minutes * 60));
    return `${neg ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const TARGET_LABEL = { primary: 'Covering', backup: 'Backup', chargeNurse: 'Charge nurse' };

  function toast(message, kind = 'info') {
    let host = document.getElementById('toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || res.statusText, 'error');
      throw new Error(data.error || res.statusText);
    }
    return data;
  }

  /**
   * Subscribes to live state. `render(state)` runs when something structural changes;
   * timers ([data-deadline], [data-since]) are refreshed every second without re-rendering,
   * so inputs keep their contents.
   */
  function live(render, signatureExtra = () => '') {
    let lastSig = null;
    let lastState = null;
    const sig = (s) =>
      JSON.stringify(
        s.results.map((r) => [r.id, r.status, r.events.length, r.coverage.primary?.clinician.id, r.notifications.map((n) => n.status)])
      ) + signatureExtra();

    function update(state, force) {
      lastState = state;
      const s = sig(state);
      if (force || s !== lastSig) {
        lastSig = s;
        render(state);
      }
      tickTimers(state);
      const clock = document.getElementById('clock');
      if (clock) clock.textContent = hhmm(state.now);
    }

    const es = new EventSource('/api/events');
    es.onmessage = (e) => update(JSON.parse(e.data));
    return { rerender: () => lastState && update(lastState, true), state: () => lastState };
  }

  function tickTimers(state) {
    const now = Date.parse(state.now);
    document.querySelectorAll('[data-deadline]').forEach((el) => {
      const left = (Date.parse(el.dataset.deadline) - now) / 60000;
      el.textContent = left >= 0 ? `${mmss(left)} left` : `${mmss(-left)} over`;
      el.classList.toggle('t-ok', left > 15);
      el.classList.toggle('t-warn', left <= 15 && left > 5);
      el.classList.toggle('t-crit', left <= 5);
    });
    document.querySelectorAll('[data-since]').forEach((el) => {
      el.textContent = mmss((now - Date.parse(el.dataset.since)) / 60000);
    });
  }

  /** Demo controls: post scenario results, fast-forward the clock, reset. */
  function demoBar(el) {
    el.innerHTML = `
      <span class="clock-wrap">Demo clock <strong id="clock">--:--</strong></span>
      <span class="demo-group">Post critical result:
        <button data-scn="A" title="Ordering provider is off shift">A</button>
        <button data-scn="B" title="No answer, escalation runs">B</button>
        <button data-scn="C" title="Procedure team is covering">C</button>
      </span>
      <span class="demo-group">Fast-forward:
        <button data-adv="5">+5 min</button>
        <button data-adv="10">+10 min</button>
      </span>
      <button data-reset class="ghost">Reset demo</button>`;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.scn) {
        await api('/api/results', { scenario: b.dataset.scn });
        toast(`Scenario ${b.dataset.scn}: critical result posted`);
      } else if (b.dataset.adv) {
        await api('/api/clock/advance', { minutes: Number(b.dataset.adv) });
      } else if (b.hasAttribute('data-reset')) {
        await api('/api/reset');
        toast('Demo reset');
      }
    });
  }

  function nav(active) {
    const links = [
      ['lab.html', 'Lab tech'],
      ['clinician.html', 'Clinician phone'],
      ['supervisor.html', 'Supervisor'],
    ];
    return `<a class="brand" href="/">CritCall</a><nav>${links
      .map(([href, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${label}</a>`)
      .join('')}</nav>`;
  }

  return { esc, hhmm, mmss, toast, api, live, demoBar, nav, TARGET_LABEL };
})();
