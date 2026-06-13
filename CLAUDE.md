# CLAUDE.md — Rick's Task Tracker

## Critical Rules

- **Never paste code back to the user.** All changes go through clasp push or direct file edits. If code needs to be deployed, use `clasp push` from this repo root.
- GitHub is the source of truth for all docs (README, CHANGELOG, DATA_DICTIONARY).
- Never hardcode tasks, questions, or rules — everything loads dynamically from the sheet.
- **Sheets time cells → always use `getDisplayValues()`, never `getValues()`.** Apps Script bakes the ET→UTC offset into Date objects for Time-type cells — both `Utilities.formatDate(val, TZ, ...)` and `getUTCHours()` return the wrong value (+5h). `getDisplayValues()` returns the string exactly as shown in the sheet.
- **`setHours(0,0,0,0)` and `getDay()` are banned in Apps Script.** Both use UTC, not the script timezone. Use `Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')` for today's date and `Utilities.formatDate(date, TZ, 'EEEE')` for day-of-week.
- **`clasp push` only updates `@HEAD`.** After pushing, go to Apps Script editor → Deploy → Manage deployments → create a new version to update the live `@28` deployment.

---

## Deployment

| Field | Value |
|---|---|
| Deployment ID | `AKfycbwbxtLqIOT17tzeKTY9GNIiWqKgRgKiJD8CY54oWB5BBCCoEdszaICT75vDqJbRzRprxA` |
| Script ID | `1WXXg2i6HRNhwhBxj2nLUx60DO5aMRnEbeOISS4cUdpuzUr6_QZ7Fxafw` |
| Spreadsheet ID | `1Mu8U4Mmn9GnX4CUUKPYaUAOfgY51ily7SQOnDJzXNMU` |
| Calendar ID | `rick1270@gmail.com` |
| Timezone | `America/New_York` |
| Trigger | 3am cleanup — Day timer, 3–4am, GMT-4 |

To deploy after changes: `clasp push` (from repo root). Changes take effect at the existing deployment URL — do not create a new deployment unless the old one is broken.

---

## Repo Layout

```
WebApp.js     — Google Apps Script backend (served as WebApp.gs in Apps Script)
index.html    — PWA frontend (single file; served by doGet)
appsscript.json
.clasp.json
```

---

## Sheet Structure

| Tab | Purpose |
|---|---|
| Tasks | Master task library. `active=FALSE` archives. |
| Task Notes | Appendable notes per task. Cleared by 3am script on completion. |
| Completions | Immutable log of every check-off. Never edit except `completed_at`. |
| Daily Log | One row per day, written at 3am. |
| Checkin Questions | Add rows only — never delete. `active=FALSE` hides without removing column. |
| Check-ins | One row per check-in, one column per question. Never delete columns. |
| Metrics | Weekly summaries for Lien Turley. Not yet auto-calculated. |
| Rules | Contingent task / medication safety rules. Patterns, not hardcoded features. |

---

## Notes System Design

Task Notes is a separate tab (not a column on Tasks). Design decisions:

- Each note is its own row: `note_id`, `task_id`, `task_name`, `note_text`, `added_at`, `added_for_date`, `cleared_at`
- Notes are **appendable** — multiple notes per task, multiple per date
- `cleared_at` is blank while active; set by 3am cleanup script when the task is completed
- Notes display in the task's expanded panel in the app (already working)
- `addTaskNote` action writes a new row; `getTaskNotes` returns active (uncleared) notes for a task

---

## API Actions (doGet payload)

| action | Description |
|---|---|
| `getTasks` | All active tasks |
| `addTask` | Write new task to Tasks tab |
| `getRules` | Rules tab |
| `getQuestions` | Checkin Questions tab |
| `logCompletion` | Write row to Completions tab |
| `logCheckin` | Write row to Check-ins tab |
| `getCompletions` | Read Completions tab |
| `cancelSeries` | Log Cancelled + set `end_date` in Tasks |
| `getTaskNotes` | Active notes for a task_id |
| `addTaskNote` | Append note row to Task Notes tab |
| `ping` | Health check |

---

## Task Types & Completion Rate

| Type | Counts Toward Rate | Notes |
|---|---|---|
| Flexible | Yes | |
| Time-sensitive | Yes | `minutes_late` written at 3am |
| Med | Yes | |
| Free-roll | No | Never counts regardless of status |
| Check-in | No | Opens question form |

- `completion_rate = completed / scheduled` (free-rolled excluded from both numerator and denominator)
- `minutes_late`: positive integer if late, 0 if on time or early, never negative

---

## Outstanding Items (Priority Order)

- [ ] **Metrics tab auto-calculation** — weekly summaries from Daily Log; not yet built
- [ ] **Self-Contingent repeat logic** — after completion, `start_date` resets so task reappears after `contingent_delay`
- [ ] **Rules auto-create** — when trigger task completed, show/create target task per Rules tab

---

## Key Invariants

- `task_id` format: `TASK_NNN` — gaps from deletions are fine; `addTask` uses `max+1`
- `completion_id` format: `COMP_NNNN`
- `note_id` format: `NOTE_NNN`
- `repeat_day`: comma-separated day names, e.g. `Monday,Wednesday,Saturday`
- Apt tasks: `rollover=FALSE`, auto-calendar, `reminder_minutes=30` default
- Calendar events tagged `[TaskTracker]`
- Contingent task time displayed as `parent_completion_time + delay`, not `scheduled_time`
- Cancel Today = logs Cancelled for today only; Cancel Series = logs Cancelled + sets `end_date=today`

---

## Session Continuity

At the start of each session, read:
1. `README.md` — current state and what works
2. `CHANGELOG.md` — recent changes and decisions
3. `DATA_DICTIONARY.md` — full schema reference
