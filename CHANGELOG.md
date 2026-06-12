# Task Tracker Changelog

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
