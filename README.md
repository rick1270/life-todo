# Rick's Task Tracker

A personal daily task management PWA built on Google Apps Script + Google Sheets. Designed for ADHD/depression management with medication tracking, health tasks, check-ins, and completion rate metrics.

---

## Current State

| Field | Value |
|---|---|
| Last updated | 2026-06-15 |
| App version | WebApp.gs v7.3 / index.html v7.3 |
| Deployment | Live — Google Apps Script Web App |
| Platform | PWA, added to phone home screen |

### What Works
- Task list loads dynamically from Google Sheet (Tasks tab)
- Completions, cancellations, free-rolls write to Completions tab
- Check-ins write to Check-ins tab with dynamic question columns
- Cancel Today / Cancel Series flow with confirmation steps
- Contingent tasks (hidden until parent completed, delay calculated)
- Add Task modal writes directly to sheet
- Google Calendar event creation for Apt tasks
- Today / Upcoming toggle
- Progress bar (excludes Free-roll and Check-in from rate)
- Date navigation (Yesterday / Today / Tomorrow)
- Task Notes display in expanded panel (instructions shown, notes appendable, copied to Completions on done)
- 3am cleanup trigger active (Day timer, 3-4am, GMT-4)
- CLAUDE.md in repo — project context, deployment ID, schema, rules for session continuity
- clasp workflow established — `clasp push` from repo root deploys to existing deployment
- completion_rate calculated correctly (completed only, not free-rolled)
- minutes_late calculated at 3am for Time-sensitive tasks

### Outstanding (Priority Order)
- [x] **Metrics tab auto-calculation** — runs Monday 3am, covers Mon–Sun week
- [x] **Self-Contingent repeat logic** — start_date advances by contingent_delay after completion
- ~~**Rules auto-create**~~ — removed; `contingent_on` + `contingent_delay` on Tasks covers this
- [ ] **v0.3 Fitness tracker** — Strava / Fitbod integration
- [ ] **v0.4 Health dashboard** — TCX, sleep, steps
- [ ] **Bug/feature report UI** — in-app form writing to Bugs_Features tab

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML/CSS/JS PWA (single file: index.html) |
| Backend | Google Apps Script (WebApp.gs) |
| Database | Google Sheets (8 tabs) |
| Calendar | Google Calendar API via Apps Script |
| Hosting | Google Apps Script Web App (deployed URL) |
| Version control | GitHub — github.com/rick1270/life-todo |

---

## Sheet Structure

| Tab | Purpose |
|---|---|
| Tasks | Master task library. Add/edit here. Set active=FALSE to archive. |
| Task Notes | Appendable notes per task. Cleared on completion. |
| Completions | Auto-written log of every check-off. Do not edit manually. |
| Daily Log | One row per day. Auto-calculated by Apps Script at 3am. |
| Checkin Questions | Questions shown during check-ins. Add new rows, never delete. |
| Check-ins | One row per check-in. One column per question. Never delete columns. |
| Metrics | Weekly summaries. Intended for sharing with Lien Turley. |
| ~~Rules~~ | Deleted — covered by `contingent_on` + `contingent_delay` on Tasks. |

**Spreadsheet ID:** `1Mu8U4Mmn9GnX4CUUKPYaUAOfgY51ily7SQOnDJzXNMU`

---

## Task Types

| Type | Counts Toward Rate | Time Tracked |
|---|---|---|
| Flexible | Yes | No |
| Time-sensitive | Yes | Yes (minutes late) |
| Med | Yes | No |
| Free-roll | No | No |
| Check-in | No | No — opens question form |

## Categories
`Other`, `Health`, `Med`, `Work`, `Checkin`, `Apt Medical`, `Apt Other`

---

## Key Rules
- `repeat_day` supports comma-separated days: `Monday,Wednesday,Saturday`
- Contingent tasks hidden until parent task completed
- Cancelled tasks do not affect completion rate or future series (unless Cancel Series)
- 3am script creates Daily Log row and handles task rollover
- Calendar events tagged `[TaskTracker]` for easy bulk removal
- Apt tasks: rollover=FALSE, auto-calendar, reminder=30min default
- Free-roll tasks: never count toward rate regardless of status logged
- Completion rate = completed tasks only; free-rolled never counts
- minutes_late = 0 if on time or early; never negative
- Self-Contingent and Rules items are patterns, not hardcoded features

---

## Roadmap

| Version | Focus |
|---|---|
| v0.1 ✅ | MVP — sheet structure, PWA, calendar script |
| v0.2 ✅ | Metrics tab, Self-Contingent repeat (Rules removed as redundant) |
| v0.3 | Fitness tracker integration (Strava / Fitbod) |
| v0.4 | Health dashboard — TCX, sleep, steps |
| v0.5 | TWA (Trusted Web Activity) — Android Play Store listing wrapping the existing PWA; requires custom domain pointed at GAS deployment |
| v1.0 | Full integration. Metrics for Lien Turley. |

---

## Session Continuity

At the start of each Claude session, read:
1. `CLAUDE.md` — deployment ID, rules, schema summary, outstanding items
2. `README.md` — current state and what works
3. `CHANGELOG.md` — recent changes and decisions
4. `DATA_DICTIONARY.md` — full schema reference
