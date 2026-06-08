# Task Tracker Data Dictionary

## Tasks Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| task_id | string | TASK_NNN | Auto-generated, never reuse |
| task_name | string | any | Display name |
| category | string | Other, Health, Med, Work, Checkin, Apt Medical, Apt Other | Dropdown validated |
| task_type | string | Flexible, Time-sensitive, Med, Free-roll, Check-in | Dropdown validated |
| scheduled_time | string | HH:MM AM/PM | Optional |
| time_tracking | string | None, Strict | Strict = track minutes late |
| repeat_type | string | Daily, Weekly, Once, Self-Contingent | |
| repeat_day | string | comma-separated day names | e.g. Monday, Wednesday, Saturday |
| repeat_occurrence | integer | 1-4 | Every N weeks (Weekly only) |
| start_date | date | yyyy-MM-dd | First occurrence date |
| end_date | date | yyyy-MM-dd | Optional, blank = no end |
| contingent_on | string | TASK_NNN or SELF | Hidden until parent completed |
| contingent_delay | integer | any | Delay after parent completion |
| contingent_delay_unit | string | Minutes, Hours, Days | |
| counts_toward_rate | boolean | TRUE, FALSE | FALSE for Check-in and Free-roll |
| rollover | boolean | TRUE, FALSE | Blank = TRUE. Carry forward if missed |
| reminder_minutes | integer | any | Minutes before scheduled_time for calendar reminder |
| active | boolean | TRUE, FALSE | FALSE = archived, hidden from app |
| notes | string | any | Shown in task expand panel |

## Task Notes Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| note_id | string | NOTE_NNN | Auto-generated |
| task_id | string | TASK_NNN | FK to Tasks |
| task_name | string | any | Denormalized for readability |
| note_text | string | any | The note content |
| added_at | datetime | | When note was added |
| added_for_date | date | | Which scheduled date this note applies to |
| cleared_at | datetime | | Blank = active, set by 3am cleanup on completion |

## Completions Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| completion_id | string | COMP_NNNN | Auto-generated |
| task_id | string | TASK_NNN | FK to Tasks |
| task_name | string | any | Denormalized |
| task_type | string | | At time of completion |
| scheduled_date | date | yyyy-MM-dd | Date task was scheduled |
| completed_at | datetime | | Actual completion time. Edit manually if needed |
| minutes_late | integer | | Calculated by 3am script for Time-sensitive tasks |
| status | string | Completed, Cancelled, Free-rolled, Missed | |
| counted_in_rate | boolean | TRUE, FALSE | FALSE for Free-rolled, Cancelled, Check-in |

## Daily Log Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| log_date | date | yyyy-MM-dd | One row per day, written by 3am script |
| tasks_scheduled | integer | | Count of tasks scheduled that day |
| tasks_completed | integer | | Count completed |
| tasks_cancelled | integer | | Count cancelled |
| tasks_free_rolled | integer | | Count free-rolled |
| completion_rate | percent | 0-100% | completed/scheduled |
| one_time_rolled | integer | | Count of Once tasks that rolled over |
| checkins_completed | integer | | Count of check-ins submitted |
| first_completion | time | | Time of first task completion |
| last_completion | time | | Time of last task completion |
| daily_note | string | any | Manual note field |

## Checkin Questions Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| question_id | string | Q01, Q02... | Never reuse. Add new, never delete |
| period | string | morning, midday, evening | Which check-in this appears in |
| label | string | any | Question text shown to user |
| type | string | scale, bool, multi-select (future) | scale=1-10, bool=Yes/No |
| active | boolean | TRUE, FALSE | FALSE = hidden but column preserved in Check-ins |
| notes | string | any | Scale guidance e.g. 1=very low, 10=excellent |

## Check-ins Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| checkin_id | string | CI_NNNN | Auto-generated |
| checkin_date | date | yyyy-MM-dd | |
| checkin_time | time | | |
| period | string | morning, midday, evening | |
| Q01...QNN | varies | scale: 1-10, bool: yes/no | One column per question_id. Never delete columns |

## Metrics Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| week_start | date | yyyy-MM-dd | Monday of week |
| avg_completion_rate | percent | | Average daily rate for week |
| total_one_time_rolled | integer | | |
| total_cancelled | integer | | |
| total_free_rolled | integer | | |
| avg_mood | decimal | 1-10 | From Q01/Q05/Q08 |
| avg_focus | decimal | 1-10 | From Q02/Q06/Q09 |
| avg_energy | decimal | 1-10 | Placeholder for future question |
| avg_achilles_pain | decimal | 1-10 | From Q10 |
| checkin_completion | percent | | % of check-ins submitted |
| best_day | date | | Highest completion rate day |
| worst_day | date | | Lowest completion rate day |
| med_change | string | any | Note any medication changes |
| notes | string | any | Weekly summary for Lien Turley |

## Rules Tab
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| rule_id | string | RULE_NNN | |
| rule_name | string | any | Human readable |
| trigger_task_id | string | TASK_NNN | Task that fires the rule |
| rule_type | string | Auto-create | More types planned |
| target_task_id | string | TASK_NNN | Task to create/show |
| contingent_delay | integer | any | Delay after trigger |
| contingent_delay_unit | string | Minutes, Hours, Days | |
| rule_description | string | any | |
| active | boolean | TRUE, FALSE | |

## ReadMe Tab
Session notes section columns:
| Column | Type | Domain | Notes |
|--------|------|--------|-------|
| date | date | yyyy-MM-dd | Session date |
| source | string | desktop, phone | Which device |
| type | string | status, change, error, idea, not_built, clarification | |
| content | string | any | Note content |
