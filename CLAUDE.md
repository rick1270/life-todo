# CLAUDE.md — Rick's Task Tracker

## Critical Rules

- **Never paste code back to the user.** All changes go through clasp push or direct file edits. If code needs to be deployed, use `clasp push` from this repo root.
- GitHub is the source of truth for all docs (README, CHANGELOG, DATA_DICTIONARY).
- Never hardcode tasks, questions, or rules — everything loads dynamically from the sheet.
- **Sheets time cells → always use `getDisplayValues()`, never `getValues()`.** Apps Script bakes the ET→UTC offset into Date objects for Time-type cells — both `Utilities.formatDate(val, TZ, ...)` and `getUTCHours()` return the wrong value (+5h). `getDisplayValues()` returns the string exactly as shown in the sheet.
- **`setHours(0,0,0,0)` and `getDay()` are banned in Apps Script.** Both use UTC, not the script timezone. Use `Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')` for today's date and `Utilities.formatDate(date, TZ, 'EEEE')` for day-of-week.
- **`clasp push` only updates `@HEAD`.** To deploy to production, run `clasp deploy --deploymentId <ID> --description "..."` — this updates the live deployment in one step without needing the Apps Script UI. Current live version: @45.

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
| Production URL | `https://script.google.com/macros/s/AKfycbwbxtLqIOT17tzeKTY9GNIiWqKgRgKiJD8CY54oWB5BBCCoEdszaICT75vDqJbRzRprxA/exec` |
| Current version | @52 |
| Test/Dev URL | `https://script.google.com/macros/s/AKfycbxZoPeIZsX6s7g9g2Ek6n9lJpGFkaByLiYTbgz2vb5Y/dev` |

---

## Development Workflow

**Two environments, one script project:**

| Environment | URL suffix | Code version | Use for |
|---|---|---|---|
| Production | `/exec` | @41 (stable, numbered) | Daily use on phone |
| Dev/Test | `/dev` | @HEAD (latest push) | Testing new features |

**Standard workflow:**
1. Create a feature branch in git
2. Make changes, `clasp push` (updates @HEAD only)
3. Test on the `/dev` URL — same spreadsheet, runs HEAD
4. When satisfied: merge branch to `main`
5. Apps Script editor → Deploy → Manage deployments → new version (increment number)
6. Production `/exec` URL now serves the new version

**Rules for the dev environment:**
- Never manually trigger `midnightCleanup` from the Apps Script editor while testing — it writes to the live spreadsheet and will corrupt today's data
- Schema changes (new columns) must be added to the sheet before pushing code that reads them
- The `/dev` URL requires being logged in as the script owner — it won't work for other users

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
| Metrics | Weekly summaries for Lien Turley. Auto-calculated Monday 3am by `calculateAndWriteWeeklyMetrics()`. |
| ~~Rules~~ | Deleted — redundant with `contingent_on` + `contingent_delay` on Tasks tab. |

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
| `updateTask` | Update existing task row by `task_id` |
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

- [x] **Metrics tab auto-calculation** — runs Monday 3am, averages completion rate + check-in scores for the week
- [x] **Self-Contingent repeat logic** — `start_date` resets after completion by `contingent_delay` days
- ~~**Rules auto-create**~~ — removed; `contingent_on` + `contingent_delay` on Tasks tab covers this
- [x] **Edit task** — Edit button on task card, opens modal pre-filled, saves via `updateTask` action
- [ ] **v0.3 Fitness tracker** — Strava / Fitbod integration
- [ ] **v0.4 Health dashboard** — TCX, sleep, steps
- [ ] **v0.5 TWA (Android)** — Trusted Web Activity wrapping the PWA; requires custom domain pointed at GAS deployment; publishes to Play Store
- [ ] **Bug/feature report UI** — in-app form to submit bugs and feature requests; writes to `Bugs_Features` tab; fields: Date, Type (Bug/Feat), Issue, Status (default: Needed/Hold)

---

## Key Invariants

- `task_id` format: `TASK_NNN` — gaps from deletions are fine; `addTask` uses `max+1`
- `completion_id` format: `COMP_NNNN`
- `note_id` format: `NOTE_NNN`
- `repeat_type` valid values (enforced by sheet data validation): `Daily`, `Weekly`, `One-time`, `Self-Contingent` — code must use these exact strings, not aliases like `Once`
- `repeat_day`: comma-separated day names, e.g. `Monday,Wednesday,Saturday`
- Apt tasks: `rollover=FALSE`, auto-calendar, `reminder_minutes=30` default
- Calendar events: `[TaskTracker]` = persistent (Apt/add_to_calendar, never deleted); `[TaskAlarm]` = daily reminder (all tasks with scheduled_time, deleted at next 3am)
- Contingent task time displayed as `parent_completion_time + delay`, not `scheduled_time`
- Cancel Today = logs Cancelled for today only; Cancel Series = logs Cancelled + sets `end_date=today`

---

## Session Continuity

At the start of each session, read:
1. `README.md` — current state and what works
2. `CHANGELOG.md` — recent changes and decisions
3. `DATA_DICTIONARY.md` — full schema reference
4. **`Bugs_Features` tab** — read via Google Drive MCP (`Spreadsheet ID` above) and summarize any open items (Status = `Needed` or `Hold`) for the user
