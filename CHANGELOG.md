# Task Tracker Changelog

## Session 2026-06-08

### Changes
- index.html v6: fixed category dropdown (Other, Health, Med, Work, Checkin, Apt Medical, Apt Other), type dropdown (Flexible, Time-sensitive, Med, Free-roll, Check-in)
- Free-roll type correctly sets counted_in_rate=FALSE in Completions
- Work category badge added
- updateReadMe v2: fixed pipe character issue, notes now write to correct columns
- Clarified: Free-roll = completion does not count toward rate (unrelated to rollover column)
- rollover column confirmed needed: controls whether missed task carries forward day-by-day

### Decisions
- GitHub repo created for code history and session continuity
- 3am cleanup script will auto-write session notes to ReadMe tab
- Data dictionary needed for all sheets and columns (future task)

## Session 2026-06-07

### Changes
- WebApp.gs v5: getTasks, addTask, getRules, getQuestions, getCompletions, logCompletion, logCheckin all dynamic from sheet
- addTask writes new tasks to Tasks sheet tab, persists across sessions
- createCalendarEvent fires for any task with add_to_calendar=TRUE
- Apt Medical / Apt Other category added: gold border, auto rollover=FALSE, calendar=TRUE, reminder=30min
- 3am cleanup script added (midnightCleanup function) - set as time-driven trigger
- counts_toward_rate respected in progress bar calculation
- updateReadMe function added to WebApp.gs
- Today/Upcoming toggle added to app
- Add Task modal expanded: all fields, days of week buttons, frequency, start/end date, rollover, reminder, calendar checkbox

### Decisions
- Tasks, questions, rules all load dynamically from sheet - never hardcode
- Categories: Other, Health, Med, Work, Checkin, Apt Medical, Apt Other
- Task Types: Flexible, Time-sensitive, Med, Free-roll, Check-in
- Rollover column: TRUE/FALSE, blank=TRUE, controls day-forward carry of missed tasks
- Apt tasks: never cancelled, no rollover, auto calendar event, high priority
- Calendar events tagged [TaskTracker], never deleted

## Session 2026-06-06

### Changes
- Google Sheet built (8 tabs: Tasks, Task Notes, Completions, Daily Log, Checkin Questions, Check-ins, Metrics, Rules, ReadMe)
- Web App deployed as PWA, added to phone home screen
- Completions write to sheet and sync between devices via Reload button
- Check-ins load questions dynamically from Checkin Questions tab
- Check-ins write to Check-ins tab with correct question_id columns
- Period tied to task ID: TASK_001=morning, TASK_002=midday, TASK_003=evening
- Date timezone fix (America/New_York)
- Dynamic task loading from Tasks sheet tab

### Known Issues at Session End
- 3am cleanup not yet triggered
- Modal dropdowns were hardcoded (fixed in 2026-06-07 session)
