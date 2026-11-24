const { esc, hhmm, api, toast, TARGET_LABEL } = CC;

document.getElementById('nav').outerHTML = CC.nav('lab.html');
CC.demoBar(document.getElementById('demo'));

let selectedId = null;
let known = null; // result ids seen so far, to auto-select newly posted results
const name = (state, id) => (state.clinicians.find((c) => c.id === id) || { name: id }).name;

const live = CC.live(render, () => selectedId || '');

function render(state) {
  const { results } = state;
  const fresh = known ? results.find((r) => !known.has(r.id)) : null;
  known = new Set(results.map((r) => r.id));
  if (fresh) selectedId = fresh.id;
  if (!results.some((r) => r.id === selectedId)) {
    selectedId = (results.find((r) => r.status === 'open') || results[0] || {}).id || null;
  }
  renderQueue(state);
  renderDetail(state, results.find((r) => r.id === selectedId));
}

function renderQueue(state) {
  const q = document.getElementById('queue');
  if (!state.results.length) {
    q.innerHTML = `<div class="panel empty">No critical results.<br><span class="small">Use <b>Post critical result</b> above to start a scenario.</span></div>`;
    return;
  }
  q.innerHTML = state.results
    .map((r) => {
      const p = r.coverage.patient;
      const timer = r.status === 'open' ? `<span class="timer" data-deadline="${r.deadline}"></span>` : '';
      return `<button class="queue-item ${r.id === selectedId ? 'selected' : ''}" data-id="${r.id}">
        <div class="row"><strong>${esc(p.name)}</strong>${statusChip(r)}</div>
        <div class="small muted">${esc(p.bed)} · MRN ${esc(p.mrn)}</div>
        <div class="row"><span class="val">${esc(r.test)} ${esc(r.value)}</span>${timer}</div>
      </button>`;
    })
    .join('');
}

document.getElementById('queue').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  selectedId = b.dataset.id;
  live.rerender();
});

function statusChip(r) {
  if (r.redFlag && r.status === 'open') return `<span class="chip red">RED FLAG</span>`;
  const label = { open: r.notifications.length ? 'Awaiting ack' : 'Not notified', acknowledged: 'Read-back pending', closed: 'Closed' }[r.status];
  return `<span class="chip ${r.status}">${label}</span>`;
}

function renderDetail(state, r) {
  const el = document.getElementById('detail');
  if (!r) {
    el.innerHTML = `<div class="empty"><h2>Ready for the demo</h2>
      <p>Post scenario <b>A</b> to show a result whose ordering provider has gone off shift.</p></div>`;
    return;
  }
  const c = r.coverage;
  const p = c.patient;
  const open = r.status === 'open';
  const contacted = (id) => r.notifications.some((n) => n.recipientId === id);

  const timerBox = open
    ? `<div class="timer-box"><span class="small muted">30-min policy timer</span><span class="timer" data-deadline="${r.deadline}"></span></div>`
    : r.ack
      ? `<div class="timer-box"><span class="small muted">Time to acknowledgment</span><span class="timer t-ok">${CC.mmss(r.ack.minutesToAck)}</span></div>`
      : '';

  const covering = c.primary
    ? `<div class="cov-card covering">
        <div class="label">Covering now</div>
        <div class="name">${esc(c.primary.clinician.name)}</div>
        <div>${esc(c.primary.clinician.role)}</div>
        <div class="reason">${esc(c.primary.reason)}</div>
        <div class="actions">
          <button class="primary" data-notify="primary" ${!open || contacted(c.primary.clinician.id) ? 'disabled' : ''}>
            ${contacted(c.primary.clinician.id) ? 'Notified' : 'Notify covering clinician'}</button>
          <button data-call="primary" ${!open || contacted(c.primary.clinician.id) ? 'disabled' : ''}>Call ${esc(c.primary.clinician.phone)}</button>
        </div>
      </div>`
    : `<div class="cov-card warn"><div class="label">Covering now</div><div class="name">No one found</div>
        <div class="reason">No on-call entry for this service. Call the attending directly.</div></div>`;

  const o = c.ordering;
  const orderingCard = o
    ? `<div class="cov-card ${o.covering ? 'match' : 'warn'}">
        <div class="label">Ordered by</div>
        <div class="mini"><strong>${esc(o.clinician.name)}</strong></div>
        <div class="small">${esc(o.clinician.role)} · ordered ${hhmm(r.orderedAt)}</div>
        <div class="small" style="margin-top:6px;font-weight:600">${
          o.covering
            ? 'Also the covering clinician'
            : `Not covering this patient now${o.offShiftSince ? `. Off shift since ${hhmm(o.offShiftSince)}` : ''}. Do not call.`
        }</div>
      </div>`
    : '';

  const otherCard = (target) => {
    const x = c[target];
    if (!x) return '';
    return `<div class="cov-card">
      <div class="mini"><span class="label">${TARGET_LABEL[target]}</span>
        <button class="small" data-notify="${target}" ${!open || contacted(x.clinician.id) ? 'disabled' : ''}>${contacted(x.clinician.id) ? 'Notified' : 'Notify'}</button></div>
      <strong>${esc(x.clinician.name)}</strong> <span class="small muted">${esc(x.clinician.phone)}</span>
      <div class="reason">${esc(x.reason)}</div>
    </div>`;
  };

  const banners = [
    r.redFlag && open ? `<div class="banner red">25 minutes without acknowledgment. Call the attending directly.</div>` : '',
    r.supervisorAlerted && open && !r.redFlag ? `<div class="banner warn">Escalated: charge nurse and lab supervisor alerted.</div>` : '',
    r.breached ? `<div class="banner red">Policy breach: not acknowledged within 30 minutes.</div>` : '',
  ].join('');

  const notifRows = r.notifications.length
    ? `<table><thead><tr><th>Sent</th><th>To</th><th>Role</th><th>Via</th><th>Status</th><th></th></tr></thead><tbody>${r.notifications
        .map(
          (n) => `<tr>
            <td>${hhmm(n.sentAt)}</td>
            <td>${esc(name(state, n.recipientId))}</td>
            <td>${TARGET_LABEL[n.target]}${n.auto ? ' <span class="chip">auto</span>' : ''}</td>
            <td>${n.channel === 'call' ? 'Call' : 'Secure msg'}</td>
            <td><span class="chip ${n.status}">${n.status}${n.ackAt ? ` ${hhmm(n.ackAt)}` : ''}</span>${n.rejectReason ? `<div class="small muted">${esc(n.rejectReason)}</div>` : ''}</td>
            <td>${n.status === 'sent' ? `<button class="small danger" data-wrong="${n.id}">Wrong person</button>` : ''}</td>
          </tr>`
        )
        .join('')}</tbody></table>`
    : `<p class="muted small">No one contacted yet.</p>`;

  let loop;
  if (r.status === 'open') {
    loop = `<div class="loop"><span class="muted">Waiting for the clinician to acknowledge and read back the value.</span></div>`;
  } else {
    const a = r.ack;
    loop = `<div class="loop ${a.matches ? 'ok' : 'bad'}">
      <div><strong>${esc(name(state, a.by))}</strong> acknowledged at ${hhmm(a.at)}.</div>
      <div>Read-back: <strong>"${esc(a.readBack)}"</strong>. ${a.matches ? 'Matches the value.' : `Does not match ${esc(r.value)}. Call to confirm.`}</div>
      ${
        r.status === 'acknowledged'
          ? `<div style="margin-top:10px"><button class="success" data-close="${r.id}">Verify read-back and close</button></div>`
          : `<div style="margin-top:6px" class="small">Closed at ${hhmm(r.closedAt)}.</div>`
      }
    </div>`;
  }

  el.innerHTML = `
    <div class="result-head">
      <div>
        <h2>${esc(p.name)} <span class="muted small">MRN ${esc(p.mrn)} · ${esc(p.bed)} · ${esc(p.primaryServiceName)}</span></h2>
        <div class="value">${esc(r.test)}: ${esc(r.value)} ${esc(r.units)} <span class="chip open">${esc(r.flag)}</span></div>
        <div class="muted small">Reference ${esc(r.refRange)} · Resulted ${hhmm(r.resultedAt)}</div>
      </div>
      ${timerBox}
    </div>
    ${banners}
    <div class="coverage">
      ${covering}
      <div class="side-stack">${orderingCard}</div>
    </div>
    <div class="coverage" style="grid-template-columns:1fr 1fr">${otherCard('backup')}${otherCard('chargeNurse')}</div>
    <h3>Notifications</h3><div class="table-wrap">${notifRows}</div>
    <h3>Closed loop</h3>${loop}
    <h3>Audit timeline</h3>
    <ul class="timeline">${r.events.map((e) => `<li class="${e.type}"><span class="t">${hhmm(e.at)}</span><span>${esc(e.text)}</span></li>`).join('')}</ul>`;
}

document.getElementById('detail').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !selectedId) return;
  if (b.dataset.notify) {
    await api(`/api/results/${selectedId}/notify`, { target: b.dataset.notify, channel: 'message' });
    toast('Secure message sent');
  } else if (b.dataset.call) {
    await api(`/api/results/${selectedId}/notify`, { target: b.dataset.call, channel: 'call' });
    toast('Call placed and logged');
  } else if (b.dataset.wrong) {
    await api(`/api/notifications/${b.dataset.wrong}/wrong-person`, { reason: 'Lab: not covering this patient' });
    toast('Re-routed to the next contact');
  } else if (b.dataset.close) {
    await api(`/api/results/${b.dataset.close}/close`);
    toast('Result closed');
  }
});
