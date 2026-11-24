const { esc, hhmm, mmss } = CC;

document.getElementById('nav').outerHTML = CC.nav('supervisor.html');
CC.demoBar(document.getElementById('demo'));

const STEP_LABEL = ['Covering clinician', 'Backup notified', 'Charge nurse + supervisor', 'RED FLAG'];
const name = (state, id) => (state.clinicians.find((c) => c.id === id) || { name: id }).name;

// Re-render every second here: the time bars are the point of this view and it has no inputs.
CC.live(render, () => String(Date.now() / 1000 | 0));

function render(state) {
  const now = Date.parse(state.now);
  const open = state.results.filter((r) => r.status === 'open');
  const done = state.results.filter((r) => r.status !== 'open');
  const acks = done.map((r) => r.ack.minutesToAck);
  const avg = acks.length ? acks.reduce((a, b) => a + b, 0) / acks.length : null;
  const misroutes = state.results.reduce((n, r) => n + r.notifications.filter((x) => x.status === 'rejected').length, 0);
  const breaches = state.results.filter((r) => r.breached).length;

  document.getElementById('tiles').innerHTML = [
    ['Open critical results', open.length],
    ['Avg time to acknowledge', avg === null ? '–' : mmss(avg)],
    ['Wrong-person re-routes', misroutes],
    ['30-min policy breaches', breaches],
  ]
    .map(([label, v]) => `<div class="panel tile"><div class="small muted">${label}</div><div class="big">${v}</div></div>`)
    .join('');

  document.getElementById('open').innerHTML = open.length
    ? `<div class="table-wrap"><table><thead><tr><th>Patient</th><th>Result</th><th>Covering now</th><th>Contacted</th><th>Stage</th><th>Time left</th></tr></thead><tbody>${open
        .map((r) => {
          const left = (Date.parse(r.deadline) - now) / 60000;
          const pct = Math.max(0, Math.min(100, (left / state.policyMinutes) * 100));
          const color = left > 15 ? 'var(--ok)' : left > 5 ? 'var(--warn)' : 'var(--crit)';
          return `<tr class="${r.redFlag ? 'red-row' : ''}">
            <td><strong>${esc(r.coverage.patient.name)}</strong><div class="small muted">${esc(r.coverage.patient.bed)}</div></td>
            <td>${esc(r.test)} <strong>${esc(r.value)}</strong> ${esc(r.units)}</td>
            <td>${esc(r.coverage.primary ? r.coverage.primary.clinician.name : 'None found')}</td>
            <td>${r.notifications.length ? r.notifications.map((n) => esc(name(state, n.recipientId))).join(', ') : '<span class="chip open">Nobody yet</span>'}</td>
            <td>${r.redFlag ? '<span class="chip red">RED FLAG</span>' : esc(STEP_LABEL[r.escalationStep])}</td>
            <td><span class="timer" data-deadline="${r.deadline}"></span><div class="bar"><span style="width:${pct}%;background:${color}"></span></div></td>
          </tr>`;
        })
        .join('')}</tbody></table></div>`
    : `<p class="muted">None. Every critical result has been acknowledged.</p>`;

  document.getElementById('done').innerHTML = done.length
    ? `<div class="table-wrap"><table><thead><tr><th>Patient</th><th>Result</th><th>Acknowledged by</th><th>Time to ack</th><th>Read-back</th><th>Status</th></tr></thead><tbody>${done
        .map(
          (r) => `<tr>
            <td>${esc(r.coverage.patient.name)}</td>
            <td>${esc(r.test)} ${esc(r.value)}</td>
            <td>${esc(name(state, r.ack.by))} at ${hhmm(r.ack.at)}</td>
            <td class="timer ${r.ack.minutesToAck <= 30 ? 't-ok' : 't-crit'}">${mmss(r.ack.minutesToAck)}</td>
            <td>${r.ack.matches ? 'Matches' : '<span class="t-crit">Mismatch</span>'}</td>
            <td><span class="chip ${r.status}">${r.status === 'closed' ? 'Closed' : 'Read-back pending'}</span></td>
          </tr>`
        )
        .join('')}</tbody></table></div>`
    : `<p class="muted">None yet.</p>`;
}
