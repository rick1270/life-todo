# Task Tracker Changelog

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
