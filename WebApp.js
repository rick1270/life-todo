// ============================================================
// RICK'S TASK TRACKER — WebApp.gs v7.3
// ============================================================
// Changes in v6.6:
// - dateToYMD() global helper added: extracts UTC date components from a Date object
//   instead of Utilities.formatDate(val, TZ, ...). Sheets DATE cells are stored as
//   midnight UTC; formatting midnight UTC in ET gives the previous day (off-by-one).
//   UTC date components are always correct for any Sheets date cell.
// - getTasks fmtDate: now uses dateToYMD() — fixes Once task start_date off-by-one
//   (task appeared scheduled for yesterday, not today).
// - isTaskScheduledOnDate: startStr/endStr use dateToYMD() — same midnight UTC fix.
// - midnightCleanup minutes_late: two bugs fixed:
//   (a) schedTime now from taskDisplayData[i][...] instead of String(Date) —
//       Date.toString() produces no AM/PM so the regex always failed, minutes_late = null
//   (b) completedMinutes now from Utilities.formatDate(completedAt, TZ, 'H'/'m') —
//       getHours() on Apps Script server returns UTC hours, not ET hours
// Changes in v6.5:
// - getTasks: fmtTime() fixed — Utilities.formatDate(val, TZ, ...) on 1899-epoch
//   Date objects applies wrong historical timezone offset (+5h); replaced with
//   getUTCHours()/getUTCMinutes() which read raw Sheets time fraction directly
// Changes in v6.3:
// - getTasks: fmtTime() helper converts scheduled_time Date objects to 'h:mm a'
//   string before JSON serialization — fixes 4-hour UTC shift ("3:00 AM" bug)
// - isTaskScheduledOnDate: day-of-week now via Utilities.formatDate(date, TZ, 'EEEE')
//   instead of date.getDay() (which uses UTC day, not ET day)
// - isTaskScheduledOnDate: start/end dates from Sheets normalized through
//   Utilities.formatDate(val, TZ, 'yyyy-MM-dd') + T12:00:00 before comparison —
//   fixes midnight-UTC-vs-midnight-ET off-by-one for Once tasks
// - midnightCleanup rollover: replaced today.setHours(0,0,0,0) (UTC midnight =
//   8pm ET previous day) with Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') —
//   fixes start_date reset writing yesterday instead of today
// Changes in v6.2:
// - midnightCleanup: calculate minutes_late for Time-sensitive tasks
//   Compares completed_at to scheduled_time, writes result to Completions sheet
//   Returns 0 if on time or early, positive integer if late
//   Respects manual edits to completed_at made before 3am
// Changes in v6.1:
// - midnightCleanup: completion_rate now excludes Free-rolled tasks
//   (was: completed + freeRolled / scheduled — inflated rate)
//   (now: completed / scheduled — accurate rate)
// Changes in v6.0:
// - getTasks now returns contingent_delay and contingent_delay_unit fields
// Changes in v5.0:
// - getTasks now returns rollover and reminder_minutes fields
// - addTask handles rollover, reminder_minutes, add_to_calendar
// - createCalendarEvent fires for any task with add_to_calendar=TRUE
// - 3am cleanup: rollover logic, daily log, mark missed tasks
// ============================================================

const SPREADSHEET_ID = '1Mu8U4Mmn9GnX4CUUKPYaUAOfgY51ily7SQOnDJzXNMU';
const TZ = 'America/New_York';
const CALENDAR_ID = 'rick1270@gmail.com';

// Sheets date cells are stored as midnight UTC; Utilities.formatDate(val, TZ, ...) on
// midnight UTC returns the previous day in ET. Use UTC date components instead.
function dateToYMD(d) {
  const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function doGet(e) {
  const payloadStr = e.parameter.payload;
  if (payloadStr) {
    try {
      const payload = JSON.parse(decodeURIComponent(payloadStr));
      let result;
      if      (payload.action === 'getTasks')        result = getTasks();
      else if (payload.action === 'addTask')         result = addTask(payload);
      else if (payload.action === 'updateTask')     result = updateTask(payload);
      else if (payload.action === 'getRules')        result = getRules();
      else if (payload.action === 'getQuestions')    result = getQuestions();
      else if (payload.action === 'logCompletion')   result = logCompletion(payload);
      else if (payload.action === 'logCheckin')      result = logCheckin(payload);
      else if (payload.action === 'getCompletions')  result = getCompletions(payload);
      else if (payload.action === 'cancelSeries')    result = cancelSeries(payload);
      else if (payload.action === 'getTaskNotes')    result = getTaskNotes(payload);
      else if (payload.action === 'addTaskNote')     result = addTaskNote(payload);
      else if (payload.action === 'ping')            result = { success: true };
      else result = { success: false, error: 'Unknown action' };
      return jsonResponse(result);
    } catch(err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }
  let env = 'PROD';
  try {
    const svcUrl = ScriptApp.getService().getUrl();
    if (svcUrl && svcUrl.endsWith('/dev')) env = 'DEV';
  } catch(err) {}
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Life To Do - ' + env)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  return html;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET TASKS ─────────────────────────────────────────────────
function getTasks() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Tasks');
  const data = sheet.getDataRange().getValues();
  const displayData = sheet.getDataRange().getDisplayValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const tasks = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[col['task_id']]) continue;
    if (String(r[col['active']]).toUpperCase() !== 'TRUE') continue;

    const fmtDate = val => {
      if (!val) return '';
      if (val instanceof Date) return dateToYMD(val);
      return String(val);
    };


    const rolloverVal = String(r[col['rollover']]).toUpperCase();
    const rollover = rolloverVal === 'FALSE' ? false : true; // blank = TRUE

    tasks.push({
      id:               r[col['task_id']],
      name:             r[col['task_name']],
      category:         r[col['category']],
      type:             r[col['task_type']],
      time:             displayData[i][col['scheduled_time']] || '',
      repeat:           r[col['repeat_type']],
      days:             r[col['repeat_day']] || '',
      freq:             parseInt(r[col['repeat_occurrence']]) || 1,
      start_date:       fmtDate(r[col['start_date']]),
      end_date:         fmtDate(r[col['end_date']]),
      contingent_on:      r[col['contingent_on']] || '',
      contingent_delay:   r[col['contingent_delay']] || 0,
      contingent_delay_unit: r[col['contingent_delay_unit']] || 'Minutes',
      counts_toward_rate: String(r[col['counts_toward_rate']]).toUpperCase() === 'TRUE',
      rollover:         rollover,
      reminder_minutes: r[col['reminder_minutes']] || '',
      instructions:     r[col['notes']] || ''
    });
  }
  return { success: true, tasks: tasks };
}

// ── ADD TASK ──────────────────────────────────────────────────
function addTask(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Tasks');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Generate next task_id
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]);
    const match = id.match(/TASK_(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }
  const newId = 'TASK_' + String(maxNum + 1).padStart(3, '0');

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const isApt = String(payload.category).toLowerCase().indexOf('apt') > -1;
  const rollover = isApt ? false : (payload.rollover === true || payload.rollover === 'TRUE');

  const row = new Array(headers.length).fill('');
  row[col['task_id']]               = newId;
  row[col['task_name']]             = payload.name;
  row[col['category']]              = payload.category;
  row[col['task_type']]             = payload.type;
  row[col['scheduled_time']]        = payload.time || '';
  row[col['time_tracking']]         = isApt ? 'Strict' : 'None';
  row[col['repeat_type']]           = payload.repeat;
  row[col['repeat_day']]            = payload.days || '';
  row[col['repeat_occurrence']]     = payload.freq || 1;
  row[col['start_date']]            = payload.start_date || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  row[col['end_date']]              = payload.end_date || '';
  row[col['contingent_on']]         = payload.contingent_on || '';
  row[col['contingent_delay']]      = payload.contingent_delay || '';
  row[col['contingent_delay_unit']] = payload.contingent_delay_unit || '';
  row[col['counts_toward_rate']]    = payload.type === 'Check-in' ? 'FALSE' : 'TRUE';
  row[col['rollover']]              = rollover ? 'TRUE' : 'FALSE';
  row[col['reminder_minutes']]      = payload.reminder_minutes || '';
  row[col['active']]                = 'TRUE';
  row[col['notes']]                 = payload.note || '';

  sheet.appendRow(row);

  // Create calendar event if requested
  if (payload.add_to_calendar || isApt) {
    try {
      createCalendarEvent({
        task_id:          newId,
        name:             payload.name,
        category:         payload.category,
        date:             payload.start_date,
        time:             payload.time,
        reminder_minutes: payload.reminder_minutes || (isApt ? 30 : ''),
        repeat:           payload.repeat,
        days:             payload.days,
        note:             payload.note
      });
    } catch(e) {
      // Calendar creation failed silently — task still saved
    }
  }

  // Create same-day alarm for any task with a scheduled time
  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (payload.time && payload.start_date === todayStr) {
    try {
      createAlarmEvent({
        name:             payload.name,
        date:             payload.start_date,
        time:             payload.time,
        reminder_minutes: payload.reminder_minutes || 0
      });
    } catch(e) {}
  }

  return { success: true, task_id: newId };
}

// ── UPDATE TASK ───────────────────────────────────────────────
function updateTask(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Tasks');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col['task_id']]) !== String(payload.task_id)) continue;

    const rowNum = i + 1;
    const isApt = String(payload.category).toLowerCase().indexOf('apt') > -1;
    const rollover = isApt ? false : (payload.rollover === true || payload.rollover === 'TRUE');

    const updates = {
      task_name:             payload.name,
      category:              payload.category,
      task_type:             payload.type,
      scheduled_time:        payload.time || '',
      time_tracking:         isApt ? 'Strict' : 'None',
      repeat_type:           payload.repeat,
      repeat_day:            payload.days || '',
      repeat_occurrence:     payload.freq || 1,
      start_date:            payload.start_date || '',
      end_date:              payload.end_date || '',
      contingent_delay:      payload.contingent_delay || '',
      contingent_delay_unit: payload.contingent_delay_unit || '',
      counts_toward_rate:    payload.type === 'Check-in' ? 'FALSE' : 'TRUE',
      rollover:              rollover ? 'TRUE' : 'FALSE',
      reminder_minutes:      payload.reminder_minutes || '',
      notes:                 payload.note || ''
    };

    Object.keys(updates).forEach(function(field) {
      if (col[field] !== undefined) {
        sheet.getRange(rowNum, col[field] + 1).setValue(updates[field]);
      }
    });

    // contingent_on: only update if payload sends a value (preserve sheet-managed cross-task deps)
    if (payload.contingent_on) {
      sheet.getRange(rowNum, col['contingent_on'] + 1).setValue(payload.contingent_on);
    }

    return { success: true };
  }
  return { success: false, error: 'Task not found: ' + payload.task_id };
}

// ── CREATE CALENDAR EVENT ─────────────────────────────────────
function createCalendarEvent(t) {
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) return;

  const dateStr = t.date || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const timeStr = t.time || '09:00 AM';

  // Parse date and time
  const dateParts = dateStr.split('-');
  const timeParts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  let hour = timeParts ? parseInt(timeParts[1]) : 9;
  const min  = timeParts ? parseInt(timeParts[2]) : 0;
  if (timeParts && timeParts[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (timeParts && timeParts[3].toUpperCase() === 'AM' && hour === 12) hour = 0;

  const start = new Date(parseInt(dateParts[0]), parseInt(dateParts[1])-1, parseInt(dateParts[2]), hour, min);
  const end   = new Date(start.getTime() + 60*60*1000); // 1 hour default

  const title = '[TaskTracker] ' + t.name;
  const desc  = (t.note || '') + '\nTask ID: ' + t.task_id + '\nCategory: ' + t.category;

  const options = { description: desc };
  if (t.reminder_minutes && parseInt(t.reminder_minutes) > 0) {
    options.popupMinutes = parseInt(t.reminder_minutes);
  }

  cal.createEvent(title, start, end, options);
}

// ── CREATE ALARM EVENT ───────────────────────────────────────
// [TaskAlarm] events are created daily for tasks with scheduled_time.
// Deleted next 3am. Separate from persistent [TaskTracker] events (Apt/add_to_calendar).
function createAlarmEvent(t) {
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal || !t.time) return;

  const dateStr = t.date || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const timeParts = t.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!timeParts) return;

  let hour = parseInt(timeParts[1]);
  const min = parseInt(timeParts[2]);
  if (timeParts[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (timeParts[3].toUpperCase() === 'AM' && hour === 12) hour = 0;

  const dp = dateStr.split('-');
  const start = new Date(parseInt(dp[0]), parseInt(dp[1])-1, parseInt(dp[2]), hour, min);
  const end   = new Date(start.getTime() + 30*60*1000);

  const reminderMin = parseInt(t.reminder_minutes) || 0;
  cal.createEvent('[TaskAlarm] ' + t.name, start, end, { popupMinutes: reminderMin });
}

// ── GET RULES ─────────────────────────────────────────────────
function getRules() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Rules');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const rules = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[col['rule_id']]) continue;
    if (String(r[col['active']]).toUpperCase() !== 'TRUE') continue;
    rules.push({
      rule_id:         r[col['rule_id']],
      trigger_task_id: r[col['trigger_task_id']],
      rule_type:       r[col['rule_type']],
      target_task_id:  r[col['target_task_id']],
      delay:           r[col['contingent_delay']],
      delay_unit:      r[col['contingent_delay_unit']]
    });
  }
  return { success: true, rules: rules };
}

// ── GET QUESTIONS ─────────────────────────────────────────────
function getQuestions() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Checkin Questions');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const questions = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[col['question_id']]) continue;
    if (String(r[col['active']]).toUpperCase() !== 'TRUE') continue;
    questions.push({
      question_id: r[col['question_id']],
      period:      r[col['period']],
      label:       r[col['label']],
      type:        r[col['type']]
    });
  }
  return { success: true, questions: questions };
}

// ── LOG COMPLETION ────────────────────────────────────────────
function logCompletion(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Completions');
  const lastRow = sheet.getLastRow();
  const lastId = lastRow > 1 ? sheet.getRange(lastRow, 1).getValue() : 'COMP_0000';
  const num = parseInt(String(lastId).replace('COMP_','')) + 1;
  const newId = 'COMP_' + String(num).padStart(4, '0');
  const notesText = payload.status === 'Completed' ? gatherAndClearTaskNotes(ss, payload.task_id) : '';
  sheet.appendRow([
    newId,
    payload.task_id,
    payload.task_name,
    payload.task_type,
    Utilities.formatDate(new Date(payload.scheduled_date + 'T12:00:00'), TZ, 'yyyy-MM-dd'),
    payload.completed_at,
    notesText,
    payload.status,
    payload.counted_in_rate ? 'TRUE' : 'FALSE'
  ]);
  return { success: true, completion_id: newId };
}

// ── TASK NOTES ────────────────────────────────────────────────
function getTaskNotes(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Task Notes');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, notes: [] };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);
  const notes = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[col['task_id']]) === String(payload.task_id)) {
      notes.push({
        note_id:    r[col['note_id']],
        note_text:  String(r[col['note_text']] || ''),
        created_at: r[col['created_at']] ? Utilities.formatDate(new Date(r[col['created_at']]), TZ, 'M/d h:mm a') : ''
      });
    }
  }
  return { success: true, notes: notes };
}

function addTaskNote(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Task Notes');
  if (!sheet) {
    sheet = ss.insertSheet('Task Notes');
    sheet.getRange(1, 1, 1, 4).setValues([['note_id', 'task_id', 'note_text', 'created_at']]);
  }
  const lastRow = sheet.getLastRow();
  const lastId = lastRow > 1 ? sheet.getRange(lastRow, 1).getValue() : 'NOTE_0000';
  const num = parseInt(String(lastId).replace('NOTE_','')) + 1;
  const newId = 'NOTE_' + String(num).padStart(4, '0');
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  sheet.appendRow([newId, payload.task_id, payload.note_text, now]);
  return { success: true, note_id: newId };
}

function gatherAndClearTaskNotes(ss, taskId) {
  const sheet = ss.getSheetByName('Task Notes');
  if (!sheet || sheet.getLastRow() < 2) return '';
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);
  const noteTexts = [];
  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col['task_id']]) === String(taskId)) {
      noteTexts.push(String(data[i][col['note_text']] || ''));
      rowsToDelete.push(i + 1);
    }
  }
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }
  return noteTexts.join('\n');
}

// ── GET COMPLETIONS ───────────────────────────────────────────
function getCompletions(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Completions');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);
  const today = payload.date;
  const results = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const taskId = row[col['task_id']];
    const status = row[col['status']];
    let scheduledDate = row[col['scheduled_date']];
    if (scheduledDate instanceof Date) {
      scheduledDate = dateToYMD(scheduledDate);
    } else {
      scheduledDate = String(scheduledDate);
    }
    if (scheduledDate === today && taskId) {
      if (status === 'Cancelled') results[taskId] = 'cancelled';
      else if (status === 'Uncompleted') delete results[taskId];
      else results[taskId] = 'done';
    }
  }
  return { success: true, completions: results };
}

// ── LOG CHECKIN ───────────────────────────────────────────────
function logCheckin(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Check-ins');

  const baseHeaders = ['checkin_id','checkin_date','checkin_time','period'];
  if (sheet.getLastColumn() === 0 || sheet.getRange(1,1).getValue() !== 'checkin_id') {
    sheet.getRange(1, 1, 1, baseHeaders.length).setValues([baseHeaders]);
  }

  let currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const answers = payload.answers || {};

  Object.keys(answers).forEach(qid => {
    if (currentHeaders.indexOf(qid) === -1) {
      const newCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newCol).setValue(qid);
      currentHeaders.push(qid);
    }
  });

  const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastRow = sheet.getLastRow();
  const lastId = lastRow > 1 ? sheet.getRange(lastRow, 1).getValue() : 'CI_0000';
  const num = parseInt(String(lastId).replace('CI_','')) + 1;
  const newId = 'CI_' + String(num).padStart(4, '0');

  const row = new Array(finalHeaders.length).fill('');
  row[finalHeaders.indexOf('checkin_id')]   = newId;
  row[finalHeaders.indexOf('checkin_date')] = Utilities.formatDate(new Date(payload.checkin_date + 'T12:00:00'), TZ, 'yyyy-MM-dd');
  row[finalHeaders.indexOf('checkin_time')] = payload.checkin_time;
  row[finalHeaders.indexOf('period')]       = payload.period;
  Object.keys(answers).forEach(qid => {
    const idx = finalHeaders.indexOf(qid);
    if (idx > -1) row[idx] = answers[qid];
  });

  sheet.appendRow(row);
  return { success: true, checkin_id: newId };
}

// ── CANCEL SERIES ─────────────────────────────────────────────
function cancelSeries(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Tasks');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col['task_id']]) === String(payload.task_id)) {
      sheet.getRange(i + 1, col['end_date'] + 1).setValue(payload.end_date);
      return { success: true };
    }
  }
  return { success: false, error: 'Task not found' };
}

// ── 3AM CLEANUP ───────────────────────────────────────────────
// Runs daily at 3am via Apps Script time-driven trigger
function midnightCleanup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = TZ;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd');

  const tasksSheet = ss.getSheetByName('Tasks');
  const compSheet  = ss.getSheetByName('Completions');
  const logSheet   = ss.getSheetByName('Daily Log');

  const taskData = tasksSheet.getDataRange().getValues();
  const taskDisplayData = tasksSheet.getDataRange().getDisplayValues();
  const taskHeaders = taskData[0];
  const tCol = {};
  taskHeaders.forEach((h, i) => tCol[h] = i);

  const compData = compSheet.getDataRange().getValues();
  const compHeaders = compData[0];
  const cCol = {};
  compHeaders.forEach((h, i) => cCol[h] = i);

  // Build set of task_ids completed yesterday
  // Also track completion row index for minutes_late calculation
  const completedYesterday = {};
  const completionRowIndex = {}; // task_id → sheet row index (1-based)
  for (let i = 1; i < compData.length; i++) {
    const row = compData[i];
    let sd = row[cCol['scheduled_date']];
    if (sd instanceof Date) sd = dateToYMD(sd);
    else sd = String(sd);
    if (sd === yesterdayStr) {
      completedYesterday[row[cCol['task_id']]] = row[cCol['status']];
      completionRowIndex[row[cCol['task_id']]] = i + 1;
    }
  }

  // ── MINUTES LATE ─────────────────────────────────────────────
  // For Time-sensitive tasks completed yesterday, calculate minutes late
  // Only writes if completed_at is after scheduled_time; otherwise writes 0
  for (let i = 1; i < taskData.length; i++) {
    const r = taskData[i];
    const taskId   = String(r[tCol['task_id']]);
    const taskType = String(r[tCol['task_type']]);
    const schedTime = (taskDisplayData[i][tCol['scheduled_time']] || '').trim();

    if (taskType !== 'Time-sensitive') continue;
    if (!schedTime) continue;
    if (completedYesterday[taskId] !== 'Completed') continue;

    const rowIdx = completionRowIndex[taskId];
    if (!rowIdx) continue;

    // Parse scheduled time into minutes since midnight
    const stMatch = schedTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!stMatch) continue;
    let stH = parseInt(stMatch[1]), stM = parseInt(stMatch[2]);
    if (stMatch[3].toUpperCase() === 'PM' && stH !== 12) stH += 12;
    if (stMatch[3].toUpperCase() === 'AM' && stH === 12) stH = 0;
    const scheduledMinutes = stH * 60 + stM;

    // Parse completed_at from sheet
    const completedAtRaw = compData[rowIdx - 1][cCol['completed_at']];
    if (!completedAtRaw) continue;
    const completedAt = completedAtRaw instanceof Date ? completedAtRaw : new Date(completedAtRaw);
    if (isNaN(completedAt)) continue;
    const completedH = parseInt(Utilities.formatDate(completedAt, TZ, 'H'));
    const completedM = parseInt(Utilities.formatDate(completedAt, TZ, 'm'));
    const completedMinutes = completedH * 60 + completedM;

    const minutesLate = Math.max(0, completedMinutes - scheduledMinutes);

    // Write to minutes_late column in Completions sheet
    const minutesLateCol = cCol['minutes_late'] + 1; // 1-based column
    compSheet.getRange(rowIdx, minutesLateCol).setValue(minutesLate > 0 ? minutesLate : 0);
  }

  let scheduled = 0, completed = 0, missed = 0, cancelled = 0, freeRolled = 0, checkins = 0, oneTimeRolled = 0;
  const newCompRows = [];

  for (let i = 1; i < taskData.length; i++) {
    const r = taskData[i];
    if (!r[tCol['task_id']]) continue;
    if (String(r[tCol['active']]).toUpperCase() !== 'TRUE') continue;

    const taskId   = r[tCol['task_id']];
    const taskName = r[tCol['task_name']];
    const taskType = r[tCol['task_type']];
    const repeat   = r[tCol['repeat_type']];
    const rolloverVal = String(r[tCol['rollover']]).toUpperCase();
    const rollover = rolloverVal !== 'FALSE';

    const wasScheduled = isTaskScheduledOnDate(r, tCol, yesterday);
    if (!wasScheduled) continue;

    if (taskType === 'Check-in') { checkins++; continue; }
    scheduled++;

    const status = completedYesterday[taskId];
    if (status === 'Completed') { completed++; continue; }
    if (status === 'Cancelled') { cancelled++; continue; }
    if (status === 'Free-rolled') { freeRolled++; continue; }

    // Not completed — mark as missed
    missed++;
    const lastCompId = getLastCompId(compSheet);
    const newCompId = 'COMP_' + String(lastCompId + newCompRows.length + 1).padStart(4, '0');
    newCompRows.push([
      newCompId, taskId, taskName, taskType, yesterdayStr,
      '', '', 'Missed', String(r[tCol['counts_toward_rate']]).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'
    ]);

    // Handle rollover
    if (rollover) {
      const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
      const today = new Date(todayStr + 'T12:00:00');
      const nextOcc = getNextOccurrenceAfter(r, tCol, today);
      const daysUntilNext = nextOcc ? Math.round((nextOcc - today) / (24*60*60*1000)) : 999;
      if (daysUntilNext > 1) {
        if (repeat === 'One-time' || repeat === 'Self-Contingent') {
          tasksSheet.getRange(i+1, tCol['start_date']+1).setValue(todayStr);
          if (repeat === 'One-time') oneTimeRolled++;
        }
      }
    }
  }

  // Write missed completions
  if (newCompRows.length > 0) {
    compSheet.getRange(compSheet.getLastRow()+1, 1, newCompRows.length, newCompRows[0].length)
      .setValues(newCompRows);
  }

  // Self-Contingent: advance start_date for tasks completed yesterday
  // New start_date = completion_date + contingent_delay, so task re-appears after the delay
  for (let i = 1; i < taskData.length; i++) {
    const r = taskData[i];
    if (!r[tCol['task_id']]) continue;
    if (String(r[tCol['active']]).toUpperCase() !== 'TRUE') continue;
    if (String(r[tCol['repeat_type']]) !== 'Self-Contingent') continue;
    if (completedYesterday[String(r[tCol['task_id']])] !== 'Completed') continue;

    const delay = parseInt(r[tCol['contingent_delay']]) || 0;
    if (delay <= 0) continue;

    const unit = String(r[tCol['contingent_delay_unit']] || 'Days').trim();
    const delayDays = unit === 'Hours' ? Math.ceil(delay / 24)
                    : unit === 'Minutes' ? Math.ceil(delay / 1440)
                    : delay;

    const newStart = new Date(yesterday);
    newStart.setDate(newStart.getDate() + delayDays);
    const newStartStr = Utilities.formatDate(newStart, tz, 'yyyy-MM-dd');
    tasksSheet.getRange(i + 1, tCol['start_date'] + 1).setValue(newStartStr);
  }

  // Delete yesterday's [TaskAlarm] events and create today's
  try {
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    const yStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
    const yEnd   = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
    cal.getEvents(yStart, yEnd).forEach(function(e) {
      if (e.getTitle().indexOf('[TaskAlarm]') === 0) e.deleteEvent();
    });

    const today = new Date();
    const todayAlarmStr = Utilities.formatDate(today, tz, 'yyyy-MM-dd');
    for (let i = 1; i < taskData.length; i++) {
      const r = taskData[i];
      if (!r[tCol['task_id']]) continue;
      if (String(r[tCol['active']]).toUpperCase() !== 'TRUE') continue;
      const schedTime = (taskDisplayData[i][tCol['scheduled_time']] || '').trim();
      if (!schedTime) continue;
      if (!isTaskScheduledOnDate(r, tCol, today)) continue;
      createAlarmEvent({
        name:             r[tCol['task_name']],
        date:             todayAlarmStr,
        time:             schedTime,
        reminder_minutes: r[tCol['reminder_minutes']] || 0
      });
    }
  } catch(e) {}

  // Write Daily Log row — then on Mondays, also write weekly Metrics
  // FIX v6.1: completion_rate uses completed only, not completed + freeRolled
  // Free-rolled tasks have counted_in_rate=FALSE so must not inflate the rate
  const logLastRow = logSheet.getLastRow();
  const logLastId = logLastRow > 1 ? logSheet.getRange(logLastRow, 1).getValue() : null;
  if (logLastId !== yesterdayStr) {
    const rate = scheduled > 0 ? Math.round(completed / scheduled * 100) + '%' : '0%';
    logSheet.appendRow([
      yesterdayStr, scheduled, completed, cancelled, freeRolled,
      rate, oneTimeRolled, checkins, '', '', ''
    ]);
  }

  // Weekly metrics: run on Monday (yesterday = Sunday = end of week)
  if (Utilities.formatDate(new Date(), TZ, 'EEEE') === 'Monday') {
    calculateAndWriteWeeklyMetrics();
  }
}

// ── WEEKLY METRICS ────────────────────────────────────────────
// Called automatically from midnightCleanup on Mondays.
// Also safe to run manually any time — guards against duplicate rows.
function calculateAndWriteWeeklyMetrics() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = TZ;

  // On Monday 3am: yesterday = Sunday (end of completed week), 6 days back = Monday (start)
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekEndStr   = Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd');
  const weekStartDay = new Date(yesterday);
  weekStartDay.setDate(weekStartDay.getDate() - 6);
  const weekStartStr = Utilities.formatDate(weekStartDay, tz, 'yyyy-MM-dd');

  // Guard: skip if row for this week_start already exists
  const metricsSheet = ss.getSheetByName('Metrics');
  if (!metricsSheet) return;
  const metricsData = metricsSheet.getDataRange().getValues();
  if (metricsData.length < 1) return;
  const mHeaders = metricsData[0];
  const mCol = {};
  mHeaders.forEach((h, i) => mCol[h] = i);
  for (let i = 1; i < metricsData.length; i++) {
    let ws = metricsData[i][mCol['week_start']];
    if (ws instanceof Date) ws = dateToYMD(ws); else ws = String(ws);
    if (ws === weekStartStr) return;
  }

  // ── Daily Log aggregation ─────────────────────────────────
  const logSheet = ss.getSheetByName('Daily Log');
  const logData  = logSheet.getDataRange().getValues();
  const lHeaders = logData[0];
  const lCol = {};
  lHeaders.forEach((h, i) => lCol[h] = i);

  let rateSum = 0, rateCount = 0;
  let totalOneTimeRolled = 0, totalCancelled = 0, totalFreeRolled = 0;
  let bestRate = -1, worstRate = 101, bestDay = '', worstDay = '';

  for (let i = 1; i < logData.length; i++) {
    const row = logData[i];
    let logDate = row[lCol['log_date']];
    if (logDate instanceof Date) logDate = dateToYMD(logDate); else logDate = String(logDate);
    if (logDate < weekStartStr || logDate > weekEndStr) continue;

    const rateRaw = parseFloat(String(row[lCol['completion_rate']] || '').replace('%', ''));
    if (!isNaN(rateRaw)) {
      // Sheets auto-converts "20%" strings to decimal 0.2 — normalize to 0-100 scale
      const rate = rateRaw <= 1 ? rateRaw * 100 : rateRaw;
      rateSum += rate;
      rateCount++;
      if (rate > bestRate)  { bestRate  = rate; bestDay  = logDate; }
      if (rate < worstRate) { worstRate = rate; worstDay = logDate; }
    }
    totalOneTimeRolled += parseInt(row[lCol['one_time_rolled']]) || 0;
    totalCancelled     += parseInt(row[lCol['tasks_cancelled']]) || 0;
    totalFreeRolled    += parseInt(row[lCol['tasks_free_rolled']]) || 0;
  }
  const avgRate = rateCount > 0 ? Math.round(rateSum / rateCount) + '%' : '';

  // ── Check-ins aggregation ─────────────────────────────────
  const ciSheet = ss.getSheetByName('Check-ins');
  const ciData  = ciSheet.getDataRange().getValues();
  const ciHeaders = ciData[0];
  const ciCol = {};
  ciHeaders.forEach((h, i) => ciCol[h] = i);

  const moodQs  = ['Q01','Q05','Q08'].filter(q => ciCol[q] !== undefined);
  const focusQs = ['Q02','Q06','Q09'].filter(q => ciCol[q] !== undefined);

  let moodSum = 0, moodN = 0, focusSum = 0, focusN = 0;
  let painSum = 0, painN = 0, checkinCount = 0;

  for (let i = 1; i < ciData.length; i++) {
    const row = ciData[i];
    let ciDate = row[ciCol['checkin_date']];
    if (ciDate instanceof Date) ciDate = dateToYMD(ciDate); else ciDate = String(ciDate);
    if (ciDate < weekStartStr || ciDate > weekEndStr) continue;
    checkinCount++;

    moodQs.forEach(q => {
      const v = parseFloat(row[ciCol[q]]);
      if (!isNaN(v)) { moodSum += v; moodN++; }
    });
    focusQs.forEach(q => {
      const v = parseFloat(row[ciCol[q]]);
      if (!isNaN(v)) { focusSum += v; focusN++; }
    });
    if (ciCol['Q10'] !== undefined) {
      const v = parseFloat(row[ciCol['Q10']]);
      if (!isNaN(v)) { painSum += v; painN++; }
    }
  }

  const avgMood  = moodN  > 0 ? Math.round(moodSum  / moodN  * 10) / 10 : '';
  const avgFocus = focusN > 0 ? Math.round(focusSum / focusN * 10) / 10 : '';
  const avgPain  = painN  > 0 ? Math.round(painSum  / painN  * 10) / 10 : '';
  // 3 periods × 7 days = 21 expected check-ins per week
  const checkinCompletion = Math.round(checkinCount / 21 * 100) + '%';

  // ── Write Metrics row ─────────────────────────────────────
  const newRow = new Array(mHeaders.length).fill('');
  if (mCol['week_start']            !== undefined) newRow[mCol['week_start']]            = weekStartStr;
  if (mCol['avg_completion_rate']   !== undefined) newRow[mCol['avg_completion_rate']]   = avgRate;
  if (mCol['total_one_time_rolled'] !== undefined) newRow[mCol['total_one_time_rolled']] = totalOneTimeRolled;
  if (mCol['total_cancelled']       !== undefined) newRow[mCol['total_cancelled']]       = totalCancelled;
  if (mCol['total_free_rolled']     !== undefined) newRow[mCol['total_free_rolled']]     = totalFreeRolled;
  if (mCol['avg_mood']              !== undefined && avgMood  !== '') newRow[mCol['avg_mood']]              = avgMood;
  if (mCol['avg_focus']             !== undefined && avgFocus !== '') newRow[mCol['avg_focus']]             = avgFocus;
  if (mCol['avg_achilles_pain']     !== undefined && avgPain  !== '') newRow[mCol['avg_achilles_pain']]     = avgPain;
  if (mCol['checkin_completion']    !== undefined) newRow[mCol['checkin_completion']]    = checkinCompletion;
  if (mCol['best_day']              !== undefined && bestDay)  newRow[mCol['best_day']]  = bestDay;
  if (mCol['worst_day']             !== undefined && worstDay) newRow[mCol['worst_day']] = worstDay;
  // med_change and notes left blank — manual fields for Lien Turley

  metricsSheet.appendRow(newRow);
}

function getLastCompId(compSheet) {
  const lastRow = compSheet.getLastRow();
  if (lastRow < 2) return 0;
  const lastId = String(compSheet.getRange(lastRow, 1).getValue());
  const match = lastId.match(/COMP_(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function isTaskScheduledOnDate(r, tCol, date) {
  const repeat  = r[tCol['repeat_type']];
  const days    = r[tCol['repeat_day']] || '';
  const freq    = parseInt(r[tCol['repeat_occurrence']]) || 1;
  const dayName = Utilities.formatDate(date, TZ, 'EEEE');

  const startVal = r[tCol['start_date']];
  const endVal   = r[tCol['end_date']];
  const startStr = startVal instanceof Date ? dateToYMD(startVal) : String(startVal || '');
  const endStr   = endVal   instanceof Date ? dateToYMD(endVal)   : String(endVal   || '');
  const start = startStr ? new Date(startStr + 'T12:00:00') : null;
  const end   = endStr   ? new Date(endStr   + 'T12:00:00') : null;

  if (start && date < start) return false;
  if (end   && date > end)   return false;

  if (repeat === 'Daily') return true;
  if (repeat === 'Weekly') {
    const dayList = days.split(',').map(s => s.trim());
    if (dayList.indexOf(dayName) === -1) return false;
    if (freq <= 1 || !start) return true;
    const weeksDiff = Math.floor((date - start) / (7*24*60*60*1000));
    return weeksDiff % freq === 0;
  }
  if (repeat === 'One-time') {
    return start && Utilities.formatDate(start, TZ, 'yyyy-MM-dd') === Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
  }
  if (repeat === 'Self-Contingent') return start ? date >= start : true;
  return false;
}

function getNextOccurrenceAfter(r, tCol, fromDate) {
  for (let i = 1; i <= 365; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    if (isTaskScheduledOnDate(r, tCol, d)) return d;
  }
  return null;
}