const { esc, hhmm, api, toast, TARGET_LABEL } = CC;

document.getElementById('nav').outerHTML = CC.nav('clinician.html');

const select = document.getElementById('who');
let me = new URLSearchParams(location.search).get('id') || 'nguyen';

const live = CC.live(render, () => me);

select.addEventListener('change', () => {
  me = select.value;
  history.replaceState(null, '', `?id=${encodeURIComponent(me)}`);
  live.rerender();
});

function render(state) {
  if (!select.options.length) {
    select.innerHTML = state.clinicians
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}, ${esc(c.role)}</option>`)
      .join('');
  }
  select.value = me;

  const mine = [];
  for (const r of state.results) {
    for (const n of r.notifications) if (n.recipientId === me) mine.push({ r, n });
  }
  mine.sort((a, b) => (a.n.status === 'sent' ? 0 : 1) - (b.n.status === 'sent' ? 0 : 1) || b.n.sentAt.localeCompare(a.n.sentAt));

  const host = document.getElementById('alerts');
  if (!mine.length) {
    host.innerHTML = `<div class="empty">No critical result alerts.</div>`;
    return;
  }
  host.innerHTML = mine.map(({ r, n }) => card(r, n)).join('');
}

function card(r, n) {
  const p = r.coverage.patient;
  const pending = n.status === 'sent';
  const statusText = {
    acknowledged: `You acknowledged at ${hhmm(n.ackAt)}`,
    superseded: 'Acknowledged by another clinician',
    rejected: 'You marked this as wrong person',
  }[n.status];
  return `<div class="alert-card ${pending ? '' : 'done'}">
    <div class="mini"><span class="chip open">CRITICAL RESULT</span><span class="small muted">${hhmm(n.sentAt)}</span></div>
    <div style="margin-top:8px"><strong>${esc(p.name)}</strong> <span class="small muted">${esc(p.bed)} · MRN ${esc(p.mrn)}</span></div>
    <div class="value">${esc(r.test)}: ${esc(r.value)} ${esc(r.units)}</div>
    <div class="small muted">Ref ${esc(r.refRange)} · resulted ${hhmm(r.resultedAt)}</div>
    <div class="small" style="margin-top:6px">Sent to you as <strong>${TARGET_LABEL[n.target]}</strong>: ${esc(n.reason)}</div>
    ${
      pending
        ? `<div class="small" style="margin-top:8px">Policy timer: <span class="timer" data-deadline="${r.deadline}"></span></div>
           <input data-rb="${n.id}" placeholder="Read back the value, e.g. ${esc(r.value)} ${esc(r.units)}" autocomplete="off">
           <div class="actions">
             <button class="success" data-ack="${n.id}">Acknowledge</button>
             <button class="danger" data-wrong="${n.id}">Not my patient</button>
           </div>`
        : `<div class="small muted" style="margin-top:8px">${statusText}</div>`
    }
  </div>`;
}

document.getElementById('alerts').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ack) {
    const input = document.querySelector(`[data-rb="${b.dataset.ack}"]`);
    if (!input.value.trim()) {
      toast('Read back the value to acknowledge', 'error');
      input.focus();
      return;
    }
    await api(`/api/notifications/${b.dataset.ack}/ack`, { readBack: input.value });
    toast('Acknowledged. The lab can see your read-back.');
  } else if (b.dataset.wrong) {
    await api(`/api/notifications/${b.dataset.wrong}/wrong-person`, { reason: 'Clinician: not my patient' });
    toast('Sent back to the lab and re-routed');
  }
});
