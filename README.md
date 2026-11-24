# CritCall demo

Critical lab results often go to the provider who **ordered** the test rather than the one **covering** the patient right now. The lab tech then has to search TigerConnect for the right person, and results go unacknowledged for more than 30 minutes, which triggers incident reports.

CritCall shows the tech who is covering the patient right now, lets them contact that clinician in one click from the result, records a closed-loop read-back, and escalates automatically before the 30-minute limit.

> Demo only. All patients, clinicians and schedules in `data/seed.json` are fictional. There is no real EHR, LIS or paging integration.

## Run it

Requires Node 18+. There are no dependencies to install.

```bash
npm start
```

Open http://localhost:3000. Set `PORT` to use another port.

```bash
npm test
```

## The three views

| View | URL | Purpose |
| --- | --- | --- |
| Lab tech | `/lab.html` | Critical result queue, covering clinician vs ordering provider, one-click notify or call, read-back, audit timeline |
| Clinician phone | `/clinician.html?id=nguyen` | The alert as a clinician sees it: acknowledge with read-back, or "Not my patient" |
| Supervisor | `/supervisor.html` | Open results by time left, escalation stage, time-to-ack, re-routes, breaches |

The top bar has demo controls. It can post scenario A, B or C, fast-forward the simulated clock, and reset. The demo clock starts at 19:40, just after the 19:00 shift change. All screens update live.

## Demo script

1. **Scenario A, ordering provider off shift.** Post A. Dr. Patel ordered the potassium at 07:10, but CritCall routes to **Dr. Nguyen** (night cross-cover) and warns not to call Dr. Patel. Notify, then on the phone view (Dr. Nguyen) read back "6.8" and acknowledge. Back in the lab view, verify and close.
2. **Scenario B, no answer.** Post B and notify Dr. Kim. Click **+10 min**: the backup (Dr. Okafor) is alerted automatically. Keep going to show the charge nurse and supervisor alert at 20 min and the red flag at 25 min.
3. **Scenario C, procedure team covering.** Post C. The patient is in the cath lab, so the cardiology fellow covers, not the primary team.

## How coverage is resolved

`src/resolver.js` resolves coverage in this order:

1. An active **procedure or consult** coverage window on the patient's treatment team.
2. Otherwise, the clinician **on call (level 1)** for the patient's primary service at the current time.
3. Backup = level 2 on call (or the primary team when a procedure team covers). Charge nurse = by unit.

## Escalation ladder (`src/store.js`)

| Minutes after result, no ack | Action |
| --- | --- |
| 0 | Tech notifies the covering clinician (one click) |
| 10 | Auto-notify the backup |
| 20 | Auto-notify the charge nurse, alert the lab supervisor |
| 25 | Red flag: call the attending directly |
| 30 | Logged as a policy breach |

Closing a result requires the clinician's acknowledgment with a read-back. The app checks that the read-back value matches the result.

## Project layout

```
server.js            HTTP server, JSON API, server-sent events, demo clock
src/resolver.js      Who is covering this patient now
src/store.js         Results, notifications, acknowledgment, escalation ladder
src/time.js          Simulated clock and time helpers
data/seed.json       Fictional patients, clinicians, call schedule, scenarios
public/              Lab, clinician and supervisor views (plain HTML/JS)
test/                node:test unit tests
docs/PRD.md          Product requirements summary
```

## Next steps toward a pilot

- Replace seed data with real feeds: LIS results (HL7 ORU or FHIR Observation), EHR care team (FHIR CareTeam), and Amion or QGenda call schedules.
- Deliver through the hospital's existing messenger (TigerConnect or Vocera APIs) instead of the built-in phone view.
- Persist notifications and the audit log in a database, and add authentication.
