# Task Tracker Changelog

## Session 2026-06-17

### Changes
- `index.html`: `submitCheckin()` now calls `sendToSheet(taskId,'Completed')` after `logCheckin` succeeds
  - Was: check-in written to Check-ins tab only; `getCompletions` (which reads Completions tab) never saw it as done
  - Fix: completion row written so task stays done across page reloads
- `WebApp.js`: `addTaskNote()` now stores `created_at` as a native `Date` object instead of a formatted string
  - Was: `Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')` stored a string; Apps Script `new Date("2026-06-04 21:37")` may return `Invalid Date` on read-back
  - Fix: `new Date()` stored directly — Sheets saves it as a Date cell, `getValues()` returns a proper Date object
- `WebApp.js`: `getTaskNotes()` `created_at` handling now robust against bad formats
  - Added `instanceof Date` check, ISO T-separator fallback, and `isNaN` guard
  - A single bad `created_at` value no longer throws and silently empties the entire notes list

### Decisions
- `clasp deploy --deploymentId <ID>` can update production directly without the Apps Script UI; no longer need to go through Manage Deployments manually
- Deployed as @45

## Session 2026-06-15 (continued)

### Changes
- `index.html`: `quickDone()` now writes `Uncompleted` status to sheet when unchecking a task
  - Was: toggle to null did nothing to the sheet; reload re-fetched Completed → task appeared done again
  - Fix: `sendToSheet(id,'Uncompleted')` on uncheck; `getCompletions` now maps `Uncompleted` → `delete results[taskId]` so last row per task wins
- `index.html`: `submitCheckin()` now sets `expanded[taskId]=false` on success
  - Was: card stayed open showing "Check-in saved" even though completions[id]='done' was set
  - Fix: collapse card on successful submit so it clears like other completed tasks
- `WebApp.js`: `getCompletions` updated to handle `Uncompleted` status
  - `Cancelled` → 'cancelled', `Uncompleted` → delete key, anything else → 'done'

### Decisions
- Completions tab stays append-only; `Uncompleted` is a valid event row. Last row per task_id+date wins.
- `SCRIPT_URL` in index.html is hardcoded to `/exec` — even on the `/dev` URL, all API calls hit production. Backend fixes must be deployed to `/exec` to take effect; testing on `/dev` only validates frontend changes.
- Bugs_Features: both bugs marked Fixed in sheet. Deployed as new production version.

## Session 2026-06-15

### Changes
- `index.html`: `getViewDate()` now normalizes to noon (`setHours(12,0,0,0)`)
  - `parseDate()` returns noon for date strings (`T12:00:00`); view date was current time
  - Tasks with `start_date = today` were invisible before noon — start_date check `d < s` failed
  - Fix: align both sides of the comparison to noon; browser `setHours` is local time (not banned)
- `Bugs_Features` tab added to spreadsheet — tracks bugs and feature requests (Date, Type, Issue, Status)
- CLAUDE.md: added Bug/feature report UI to Outstanding Items (future feature)
- Deployed as new version (production updated)

### Decisions
- TASK_029 ("Get Chili Seasoning") had blank task_id (accidentally deleted) — fixed manually in sheet
- TASK_029 start_date was 2026-06-14 (missed rollover since it had no task_id at 3am) — updated to 2026-06-15 in sheet

## Session 2026-06-13 (continued-8)

### Changes
- WebApp.gs v7.3: removed Rules auto-create block from midnightCleanup
  - Rules tab deleted from sheet — redundant with `contingent_on` + `contingent_delay`
    on the Tasks tab, which already handles "show task B when task A is completed"
- CLAUDE.md / README.md: Rules tab and Rules auto-create marked as removed

### Decisions
- `contingent_on` (TASK_NNN or SELF) + `contingent_delay` covers all trigger-based
  task visibility. No separate Rules layer needed.

## Session 2026-06-13 (continued-7)

### Changes
- WebApp.gs v7.2: Rules auto-create implemented
  - On each 3am run, reads active `Auto-create` rules from Rules tab
  - When `trigger_task_id` was completed yesterday, sets `start_date` and `active=TRUE`
    on `target_task_id` using the rule's `contingent_delay` + `contingent_delay_unit`
  - Target task appears in app on `completion_date + delay`
  - Rules tab is skipped entirely if sheet is missing or has no data rows
  - All column access via rCol header map; task lookup via taskRowMap index

### Decisions
- Target task must already exist in Tasks tab — rule fires it, doesn't create it from scratch
- Setting active=TRUE allows target tasks to be stored inactive and only surfaced by rules
- Same delay math as Self-Contingent (Hours/Minutes converted to ceiling-days)

## Session 2026-06-13 (continued-6)

### Changes
- WebApp.gs v7.1: Self-Contingent repeat logic implemented
  - After a Self-Contingent task is completed, 3am cleanup advances `start_date`
    by `contingent_delay` (in `contingent_delay_unit`: Days/Hours/Minutes)
  - New start_date = completion_date + delay → task disappears until that future date
  - Frontend `isTaskOnDay` for Self-Contingent already uses `date >= start_date`,
    so no frontend changes needed
  - If `contingent_delay` is 0 or blank, start_date is not changed (task stays visible)
  - Hours/Minutes converted to days (ceiling) for start_date advancement

### Decisions
- Missed Self-Contingent tasks already rolled to today via the existing rollover block
- Only Completed status triggers the delay reset; Cancelled leaves start_date unchanged

## Session 2026-06-13 (continued-5)

### Changes
- WebApp.gs v7.0: Metrics tab auto-calculation implemented
  - New `calculateAndWriteWeeklyMetrics()` function — safe to run manually anytime
  - Called automatically from `midnightCleanup` every Monday (yesterday = Sunday = end of week)
  - Aggregates Mon–Sun from Daily Log: avg_completion_rate, total_cancelled,
    total_free_rolled, total_one_time_rolled, best_day, worst_day
  - Aggregates from Check-ins: avg_mood (Q01/Q05/Q08), avg_focus (Q02/Q06/Q09),
    avg_achilles_pain (Q10), checkin_completion (actual / 21 expected per week)
  - Duplicate guard: skips if Metrics row for that week_start already exists
  - All column writes use mCol header map — safe against column reorders
  - `one_time_rolled` counter added to midnightCleanup (was hardcoded 0 in Daily Log)

### Decisions
- checkin_completion denominator = 21 (3 periods × 7 days). Adjust if check-in
  schedule changes significantly.
- med_change and notes columns left blank — manual fields for Lien Turley to fill
- `calculateAndWriteWeeklyMetrics` can be run manually from Apps Script editor to
  backfill any missed weeks

## Session 2026-06-13 (continued-4)

### Changes
- index.html v7.2: `changeDay` now calls `loadAll()` instead of `render()`
  - Was: navigating between days kept stale `completions` in memory. Checking off a task
    while viewing Yesterday left it marked done in Today's view on navigate-back.
  - Now: every day navigation triggers a fresh fetch of completions for the new date.
- WebApp.gs v6.9: `getCompletions` hardcoded indices replaced with cCol lookups
  - Was: `row[1]`, `row[4]`, `row[7]` assumed fixed column positions
  - Now: `row[col['task_id']]`, `row[col['scheduled_date']]`, `row[col['status']]`
  - Also: `scheduled_date` Date objects now use `dateToYMD()` instead of Utilities.formatDate

### Decisions
- Any function that navigates away from current state must reload server data, not
  just re-render with stale local state.

## Session 2026-06-13 (continued-3)

### Changes
- WebApp.gs v6.8: fixed hardcoded column indices in `completedYesterday` loop
  - Was: `row[4]`, `row[1]`, `row[7]` — assumed fixed column positions for
    `scheduled_date`, `task_id`, `status`. Any column addition breaks all three silently.
  - Now: `row[cCol['scheduled_date']]`, `row[cCol['task_id']]`, `row[cCol['status']]`
  - Also fixed: `scheduled_date` midnight UTC → dateToYMD() same as start_date fix

### Decisions
- Never use hardcoded column indices against Sheets data — always use the header-mapped
  `cCol`/`tCol` objects so column additions don't silently break lookups.

## Session 2026-06-13 (continued-2)

### Changes
- WebApp.gs v6.7 / index.html v7.1: renamed `Once` → `One-time` everywhere to match
  the sheet's data validation dropdown. The sheet enforces `One-time`; the code had `Once`;
  tasks added through the sheet were invisible because no repeat type ever matched.
- CLAUDE.md: added `repeat_type` valid values with note that sheet data validation is
  authoritative — code must match exactly.

### Decisions
- Sheet data validation is the source of truth for enum values like `repeat_type`.
  Never use aliases in code that differ from the sheet's allowed values.

## Session 2026-06-13 (continued)

### Changes
- WebApp.gs v6.6: two root-cause bugs fixed — same midnight-UTC problem as time cells

  **Bug 1 — Once task not appearing in app (fmtDate off-by-one)**
  - Was: `fmtDate()` used `Utilities.formatDate(val, TZ, 'yyyy-MM-dd')` on Sheets DATE cells.
    Sheets stores dates as midnight UTC (not midnight ET). Midnight UTC June 13 = 8pm ET June 12.
    Formatting midnight UTC in ET gives '2026-06-12' → task's start_date sent as yesterday
    → frontend isTaskOnDay never matched → Once task invisible.
  - Now: `dateToYMD(d)` global helper uses `getUTCFullYear/getUTCMonth/getUTCDate`, which
    always returns June 13 for a midnight UTC June 13 date. Same fix applied to
    `isTaskScheduledOnDate` startStr/endStr.

  **Bug 2 — minutes_late always blank (two sub-bugs in midnightCleanup)**
  - Was (a): `schedTime = String(r[tCol['scheduled_time']])` — converts Date object to
    a JS date string like "Sat Jun 13 2026 09:00:00 GMT+0000"; regex `/(\d+):(\d+)\s*(AM|PM)/i`
    always fails → `continue` → minutes_late never written.
  - Now (a): `schedTime = taskDisplayData[i][tCol['scheduled_time']]` — display value is
    "9:00 AM", regex matches correctly. `taskDisplayData` added alongside `taskData`.
  - Was (b): `completedAt.getHours()` returns UTC hours on Apps Script server (UTC);
    9:30 AM ET = 1:30 PM UTC → getHours() = 13 → completedMinutes wildly wrong.
  - Now (b): `Utilities.formatDate(completedAt, TZ, 'H')` and `'m'` return ET hours/minutes.

### Decisions
- Sheets DATE cells arrive as midnight UTC — `Utilities.formatDate(val, TZ, 'yyyy-MM-dd')`
  returns the previous day in ET. Use UTC date components (`getUTCDate()` etc.) instead.
- `getHours()`/`getMinutes()` are banned for ET time comparisons in Apps Script.
  Use `Utilities.formatDate(d, TZ, 'H')` / `'m'`.

## Session 2026-06-13 (late night)

### Changes
- index.html v7: added `toLocalDateStr(d)` helper; replaced all `.toISOString().split('T')[0]`
  calls (which return UTC date, not ET date) across 5 locations:
  - `loadAll()` — date sent to `getCompletions`
  - `sendToSheet()` — `scheduled_date` written to Completions
  - `markCancelledSeries()` — `end_date` sent to cancelSeries
  - `submitCheckin()` — `checkin_date` written to Check-ins
  - `openModal()` — default start_date for Add Task form
  - Root cause: after ~8pm ET, UTC date is already tomorrow; completions stored
    with wrong date, causing old checked-off tasks to appear on the next day

### Decisions
- Never use `.toISOString()` for date strings in the frontend — returns UTC, not ET
- `toLocalDateStr(d)` uses `getFullYear()/getMonth()/getDate()` which are browser-local

## Session 2026-06-13 (night)

### Changes
- WebApp.gs v6.5: fixed scheduled_time display once and for all with getDisplayValues() ✓ confirmed working
  - Root cause: Apps Script bakes the ET→UTC offset into Date objects when reading
    Time-type Sheets cells, making both Utilities.formatDate(val, TZ, ...) and
    getUTCHours() return UTC hours rather than the cell's displayed value (+5h error)
  - Fix: getTasks now calls sheet.getDataRange().getDisplayValues() and reads
    displayData[i][col['scheduled_time']] — returns exactly what the sheet cell shows
  - Removed fmtTime() helper entirely (no longer needed)

### Decisions
- Never try to extract time from a Sheets Time-type cell Date object — use getDisplayValues()
- getValues() for dates (need Date objects for comparison); getDisplayValues() for times (need display string)

## Session 2026-06-13 (evening)

### Changes
- WebApp.gs v6.4: fixed fmtTime() regression from v6.3
  - v6.3 used `Utilities.formatDate(val, TZ, 'h:mm a')` on 1899-epoch Date objects
    (Sheets time fractions). Apps Script applies wrong historical timezone offset for
    pre-epoch dates, shifting times +5 hours instead of correcting the original -4h bug.
  - v6.4 uses `getUTCHours()` / `getUTCMinutes()` directly — Sheets time fractions are
    stored as UTC-fraction Date objects; UTC hours = the raw time value with no adjustment

### Decisions
- Never use `Utilities.formatDate` on Date objects from Sheets TIME cells (1899 epoch).
  Use `getUTCHours()` / `getUTCMinutes()` to read the raw time value instead.

## Session 2026-06-13 (afternoon)

### Changes
- WebApp.gs v6.3: four timezone/date bugs fixed in midnightCleanup and task scheduling

  **Bug 1 — `today.setHours(0,0,0,0)` was UTC midnight (= 8pm ET previous day)**
  - Was: Once/Self-Contingent missed tasks had `start_date` reset to yesterday in ET
  - Now: `Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')` gives correct ET date string;
    `new Date(todayStr + 'T12:00:00')` used as base for `getNextOccurrenceAfter`
  - Affected: rollover logic in `midnightCleanup` lines 533–540

  **Bug 2 — `date.getDay()` used UTC day of week, not ET day**
  - Was: `['Sunday',...][date.getDay()]` — UTC day, wrong near midnight ET
  - Now: `Utilities.formatDate(date, TZ, 'EEEE')` — always ET day name
  - Affected: `isTaskScheduledOnDate` — all repeat types checked against wrong day

  **Bug 3 — `start_date` Date objects from Sheets were raw UTC midnight**
  - Was: `startVal instanceof Date ? startVal : ...` — raw Date at midnight UTC = previous day ET
  - Now: normalized via `Utilities.formatDate(startVal, TZ, 'yyyy-MM-dd')` then noon constructor,
    same as string path — fixes off-by-one for Once task date matching
  - Affected: `isTaskScheduledOnDate` start/end date comparisons

  **Bug 4 — `scheduled_time` Time cells serialized as UTC ISO strings**
  - Was: `r[col['scheduled_time']] || ''` — Date objects JSON-serialized to UTC ISO string;
    frontend displayed in ET, shifting every time 4 hours earlier ("7:00 AM → 3:00 AM")
  - Now: `fmtTime()` helper converts Date objects via `Utilities.formatDate(val, TZ, 'h:mm a')`
    before serialization; plain strings passed through unchanged
  - Affected: `getTasks` — all tasks with time-formatted cells in scheduled_time column

### Decisions
- All date/time values leaving Apps Script must be formatted strings, never raw Date objects
- `Utilities.formatDate(..., TZ, ...)` is the only safe way to get ET date/time in Apps Script
- `setHours(0,0,0,0)` and `getDay()` are banned — both use UTC, not script timezone

## Session 2026-06-13

### Changes
- CLAUDE.md created — deployment ID, sheet structure, notes design, outstanding items, API actions, key invariants, session continuity instructions, no-paste-code rule
- clasp workflow established: `clasp push` from repo root deploys WebApp.js + index.html to existing deployment (no new deployment needed)
- Notes feature confirmed complete:
  - Task Notes tab: appendable rows per task, `cleared_at` set by 3am cleanup on completion
  - App: instructions shown in expand panel, notes displayed, addTaskNote action live
  - On completion: active notes copied into Completions row before clearing
- README.md and CHANGELOG.md updated to reflect session continuity via CLAUDE.md

### Decisions
- CLAUDE.md is now the first file Claude reads each session (supersedes raw GitHub URL approach)
- Never paste code back to the user — all edits go through file tools + clasp push

## Session 2026-06-12 (evening)

### Changes
- WebApp.gs v6.2: minutes_late calculation added to midnightCleanup
  - Loops Time-sensitive tasks completed yesterday
  - Compares completed_at to scheduled_time
  - Writes positive integer (minutes late) or 0 to Completions sheet
  - Respects manual edits to completed_at made before 3am
- WebApp.gs v6.1: fixed completion_rate in midnightCleanup
  - Was: (completed + freeRolled) / scheduled — inflated rate
  - Now: completed / scheduled — accurate rate
- 3am cleanup trigger set in Apps Script (Day timer, 3-4am, GMT-4)
- README.md moved from Google Sheet ReadMe tab to GitHub
- CHANGELOG.md confirmed live on GitHub
- Session continuity now reads from raw.githubusercontent.com
- Task Notes confirmed working (was already built, not a bug)

### Decisions
- GitHub is source of truth for all docs going forward (README, CHANGELOG, DATA_DICTIONARY)
- ReadMe tab in Google Sheet to be deleted by Rick
- Completion rate = completed tasks only; free-rolled never counts toward rate
- minutes_late = 0 if on time or early; never negative
- Self-Contingent and Rules items are patterns, not hardcoded features

## Session 2026-06-12 (afternoon)

### Changes
- Cancel flow: tap Cancel shows "Cancel Today" / "Cancel Series" prompt
- Cancel Series: second confirmation step, logs today as Cancelled, sets end_date in Tasks sheet
- Task disappears from app immediately after series cancel
- cancelSeries action added to WebApp.gs
- Fixed deployment issue caused by duplicate doGet in Code.gs — deleted Code.gs
- New deployment created to resolve serving issue

### Decisions
- Cancel Today = logs Cancelled for today only, series continues
- Cancel Series = logs Cancelled for today + sets end_date to today in sheet
- No "Delete" option in app — set active=FALSE directly in sheet
- task_id gaps from deleted tasks are fine — addTask uses max+1

## Session 2026-06-12 (morning)

### Changes
- index.html: contingent task display time = parent completion time + delay
- index.html: completionTimes{} tracks when each task was completed this session
- index.html: getEffectiveTime() moves contingent tasks to Scheduled section
- WebApp.gs: getTasks now returns contingent_delay and contingent_delay_unit fields
- inline cancel confirmation for Med/Apt tasks (replaces confirm() blocked by iframe)
- toMin() handles times without AM/PM, normalizeTime() standardizes display
- Free-roll excluded from progress bar, counted_in_rate logic explicit for all statuses
- Cancel available for ALL task types
- COMP_0008 duplicate fixed manually
- TASK_015 Yoga time fixed to 8:00 AM in sheet

### Decisions
- Contingent task time shown as parent_completion_time + delay, not static scheduled_time
- Rules tab kept for future complex rules; contingent logic driven by Tasks tab columns
- Drive folder ID: 1DrQ237ZQ1o_tbshhtu5uGaBS-W7qkeWu (read-only from Claude web)

## Session 2026-06-08

### Changes
- index.html v6: fixed category and type dropdowns
- Free-roll type correctly sets counted_in_rate=FALSE
- Work category badge added
- updateReadMe v2: fixed pipe character issue

### Decisions
- GitHub repo created for code history and session continuity
- Categories: Other, Health, Med, Work, Checkin, Apt Medical, Apt Other
- Task Types: Flexible, Time-sensitive, Med, Free-roll, Check-in
- Rollover column: TRUE/FALSE, blank=TRUE

## Session 2026-06-07

### Changes
- WebApp.gs: all functions dynamic from sheet
- addTask writes to Tasks tab
- createCalendarEvent, 3am cleanup script
- Today/Upcoming toggle, expanded Add Task modal
- Apt Medical/Apt Other category

### Decisions
- Tasks/questions/rules load dynamically — never hardcode
- Apt tasks: no rollover, auto calendar, high priority
- Calendar events tagged [TaskTracker], never deleted

## Session 2026-06-06

### Changes
- Google Sheet built (8 tabs)
- PWA deployed, added to phone home screen
- Completions write to sheet, sync via Reload
- Check-ins dynamic from Checkin Questions tab
- Date timezone fix (America/New_York)

### Outstanding
- 3am cleanup trigger needs to be set and verified
- Self-Contingent Haircut 21-day delay not yet implemented
- Task Notes not yet displayed in app
- Metrics tab auto-calculation not built
- minutes_late for Time-sensitive tasks not calculated
