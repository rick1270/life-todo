// ============================================================
// RICK'S TASK TRACKER — WebApp.gs v6.0
// ============================================================
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

function doGet(e) {
  const payloadStr = e.parameter.payload;
  if (payloadStr) {
    try {
      const payload = JSON.parse(decodeURIComponent(payloadStr));
      let result;
      if      (payload.action === 'getTasks')        result = getTasks();
      else if (payload.action === 'addTask')         result = addTask(payload);
      else if (payload.action === 'getRules')        result = getRules();
      else if (payload.action === 'getQuestions')    result = getQuestions();
      else if (payload.action === 'logCompletion')   result = logCompletion(payload);
      else if (payload.action === 'logCheckin')      result = logCheckin(payload);
      else if (payload.action === 'getCompletions')  result = getCompletions(payload);
      else if (payload.action === 'ping')            result = { success: true };
      else result = { success: false, error: 'Unknown action' };
      return jsonResponse(result);
    } catch(err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Task Tracker')
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
      if (val instanceof Date) return Utilities.formatDate(val, TZ, 'yyyy-MM-dd');
      return String(val);
    };

    const rolloverVal = String(r[col['rollover']]).toUpperCase();
    const rollover = rolloverVal === 'FALSE' ? false : true; // blank = TRUE

    tasks.push({
      id:               r[col['task_id']],
      name:             r[col['task_name']],
      category:         r[col['category']],
      type:             r[col['task_type']],
      time:             r[col['scheduled_time']] || '',
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
      note:             r[col['notes']] || ''
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
  row[col['contingent_on']]         = '';
  row[col['contingent_delay']]      = '';
  row[col['contingent_delay_unit']] = '';
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

  return { success: true, task_id: newId };
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
  sheet.appendRow([
    newId,
    payload.task_id,
    payload.task_name,
    payload.task_type,
    Utilities.formatDate(new Date(payload.scheduled_date + 'T12:00:00'), TZ, 'yyyy-MM-dd'),
    payload.completed_at,
    '',
    payload.status,
    payload.counted_in_rate ? 'TRUE' : 'FALSE'
  ]);
  return { success: true, completion_id: newId };
}

// ── GET COMPLETIONS ───────────────────────────────────────────
function getCompletions(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Completions');
  const data = sheet.getDataRange().getValues();
  const today = payload.date;
  const results = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const taskId = row[1];
    const status = row[7];
    let scheduledDate = row[4];
    if (scheduledDate instanceof Date) {
      scheduledDate = Utilities.formatDate(scheduledDate, TZ, 'yyyy-MM-dd');
    } else {
      scheduledDate = String(scheduledDate);
    }
    if (scheduledDate === today && taskId) {
      results[taskId] = status === 'Cancelled' ? 'cancelled' : 'done';
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

// ── 3AM CLEANUP ───────────────────────────────────────────────
// Set this function as a daily time-driven trigger at 3:00 AM
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
  const taskHeaders = taskData[0];
  const tCol = {};
  taskHeaders.forEach((h, i) => tCol[h] = i);

  const compData = compSheet.getDataRange().getValues();

  // Build set of task_ids completed yesterday
  const completedYesterday = {};
  for (let i = 1; i < compData.length; i++) {
    const row = compData[i];
    let sd = row[4];
    if (sd instanceof Date) sd = Utilities.formatDate(sd, tz, 'yyyy-MM-dd');
    else sd = String(sd);
    if (sd === yesterdayStr) completedYesterday[row[1]] = row[7]; // task_id → status
  }

  // Find tasks that were scheduled yesterday and not completed
  let scheduled = 0, completed = 0, missed = 0, cancelled = 0, freeRolled = 0, checkins = 0;
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
    const rollover = rolloverVal !== 'FALSE'; // blank = TRUE

    // Was this task scheduled yesterday?
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
      const today = new Date();
      today.setHours(0,0,0,0);
      const nextOcc = getNextOccurrenceAfter(r, tCol, today);

      // Roll over: set start_date to today only if next occurrence is more than 1 day away
      const daysUntilNext = nextOcc ? Math.round((nextOcc - today) / (24*60*60*1000)) : 999;
      if (daysUntilNext > 1) {
        // Update start_date to today to make it appear today
        // For Once tasks: update start_date directly
        if (repeat === 'Once' || repeat === 'Self-Contingent') {
          tasksSheet.getRange(i+1, tCol['start_date']+1).setValue(
            Utilities.formatDate(today, tz, 'yyyy-MM-dd')
          );
        }
        // For Weekly: task already has its own schedule, rollover means
        // add a one-time override entry — handled by app showing yesterday's incomplete task today
      }
    }
  }

  // Write missed completions
  if (newCompRows.length > 0) {
    compSheet.getRange(compSheet.getLastRow()+1, 1, newCompRows.length, newCompRows[0].length)
      .setValues(newCompRows);
  }

  // Write Daily Log row
  const logLastRow = logSheet.getLastRow();
  const logLastId = logLastRow > 1 ? logSheet.getRange(logLastRow, 1).getValue() : null;
  if (logLastId !== yesterdayStr) {
    const rate = scheduled > 0 ? Math.round((completed + freeRolled) / scheduled * 100) + '%' : '0%';
    logSheet.appendRow([
      yesterdayStr, scheduled, completed, cancelled, freeRolled,
      rate, 0, checkins, '', '', ''
    ]);
  }
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
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()];

  const startVal = r[tCol['start_date']];
  const endVal   = r[tCol['end_date']];
  const start = startVal instanceof Date ? startVal : startVal ? new Date(String(startVal)+'T12:00:00') : null;
  const end   = endVal   instanceof Date ? endVal   : endVal   ? new Date(String(endVal)+'T12:00:00')   : null;

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
  if (repeat === 'Once') {
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
