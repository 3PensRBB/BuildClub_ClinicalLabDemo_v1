# PRD summary: coverage-aware critical result routing (CritCall)

## Problem

Lab techs report critical results to the ordering provider, who often is not covering the patient after a shift change, handoff or consult. The tech then searches a separate app (TigerConnect) for the right person. Results go unacknowledged for more than 30 minutes, which breaches policy and triggers an incident report.

## Solution

Each critical result gets a **Notify covering clinician** button.

- **Coverage resolver.** Joins the treatment team with the call schedule for the current time. Returns the covering clinician, a backup and the charge nurse, and flags when the ordering provider is not covering.
- **One-click contact.** A call or a structured secure message, sent from the result screen.
- **Closed loop.** The clinician acknowledges with a read-back. The tech verifies and closes, and every step is time-stamped.
- **Escalation.** Backup at 10 min, charge nurse and supervisor at 20, red flag at 25, all before the 30-minute limit.

## Demo success metrics

| Metric | Today | Demo target |
| --- | --- | --- |
| Time from result to acknowledgment | Often over 30 min | Under 5 min |
| Contacts to reach the right person | 2 or more | 1 |
| Apps the tech uses | LIS + TigerConnect + schedule | 1 |

## Scope

- **P0 (built):** critical queue, coverage resolver, ordered-by vs covering-now, one-click notify and call, clinician acknowledge with read-back, 30-min timer, escalation ladder, audit timeline.
- **P1 (built):** supervisor dashboard, wrong-person re-route, demo clock fast-forward.
- **P2 (future):** send through TigerConnect or Vocera, real EHR, LIS and schedule integrations, reporting.

## Open questions

- Which EHR, LIS and call-schedule tools does the hospital use?
- Does the 30-minute window end at notification or at acknowledgment?
- Can a nurse accept a critical result for the clinician?
- What are the baseline incident counts and average time-to-ack?
