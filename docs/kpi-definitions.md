# P4.1 Dashboard KPI definitions

These are operational indicators only; they are not measures of employee value
and must not be used by themselves for compensation or discipline.

## Filters and access

- `from` and `to` are inclusive calendar dates in UTC and are limited to a
  366-day interval. They filter dated events (task creation/completion,
  assignment actions, collaboration, template usage, notifications, and
  logins). Current workload, overdue tasks, current approval queues, and
  project status are snapshots as of the request time.
- Projects and tasks marked deleted are excluded. Group tasks are excluded
  from task counts. Restricted projects are visible to the dashboard only
  when the requesting user is explicitly a project member.
- `system_admin` and `executive` can view organization-wide aggregates;
  `branch_director` is limited to their branch; `department_head` is limited to
  managed departments; `member` sees only their own task activity and projects
  they own, belong to, or have tasks assigned in.
- A branch or department filter narrows the server-derived scope and can never
  widen it. Individual workload rows are available only to management roles
  inside their scope. A project owner or manager may also see individual
  workload for members of projects they manage. Other members receive only
  their own row. Dashboard requests that expose individual rows are recorded
  in `activity_log`.
- No personal ranking is generated. Branch/department workload and individual
  counts are descriptive and must be interpreted with their scope and time
  window.

## Definitions

| Metric                   | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project status           | `red` when an active project has at least one open task past its due date; otherwise `yellow` when at least one open task is due within the next 7 calendar days, including today; otherwise `green`. On-hold, completed, and archived projects are not classified. This is a task-deadline signal, not earned-value or predicted project health.                                                                                                             |
| Task status              | Count of non-deleted `type=task` and `type=milestone` tasks by current status (`todo`, `doing`, `blocked`, `done`), independent of the selected event period.                                                                                                                                                                                                                                                                                                 |
| Workload                 | Current open-task counts by assignee and status. Department workload uses the assignee's department memberships; a person in multiple departments contributes to each applicable department total, so totals across departments are not additive.                                                                                                                                                                                                             |
| Overdue tasks            | Non-deleted tasks and milestones not in `done`, with `dueDate` before today.                                                                                                                                                                                                                                                                                                                                                                                  |
| Waiting approvals        | Pending approval requests in visible projects. An approval is overdue when its current flow step has `slaHours` and `updatedAt + slaHours` is before request time.                                                                                                                                                                                                                                                                                            |
| On-time completion rate  | Tasks completed in the selected period with a due date on or before the completion's UTC calendar date, divided by all tasks completed in the period with a due date. Tasks without due dates are excluded from numerator and denominator.                                                                                                                                                                                                                    |
| Assignment response time | Mean minutes from the nearest preceding `assign`/`reassign` event to each `accept` or `reject` event for the same task, where both events are in the selected period. Each response is counted at most once.                                                                                                                                                                                                                                                  |
| Return rate              | `return` assignment events in the period divided by `submit` events in the period; zero when there are no submissions.                                                                                                                                                                                                                                                                                                                                        |
| Rejection rate           | `reject` assignment events in the period divided by `assign`/`reassign` events in the period; zero when there are no assignments.                                                                                                                                                                                                                                                                                                                             |
| Extension requests       | Count of extension requests created in the selected period. No acceptance rate is shown because the P4.1 dashboard currently measures request volume only.                                                                                                                                                                                                                                                                                                    |
| Collaboration            | Count of visible, non-hidden comments created in the period and distinct visible tasks with at least one such comment. This is activity volume, not collaboration quality.                                                                                                                                                                                                                                                                                    |
| Template usage           | Number of `TemplateUsage` records created in the period, grouped by template. The schema does not record whether generated tasks were deleted or extensively changed, so those rates are not fabricated.                                                                                                                                                                                                                                                      |
| System activity          | Active users are active, visible organization users with `lastLoginAt` in the period. Notification sent/opened counts cover notifications belonging to those same active, visible users and created in the period; the opened percentage is read notifications created in the period divided by all notifications created in the period. File storage by project is not shown because the existing schema does not provide a reliable per-project byte total. |

## Known limits

The current data model does not provide reliable snapshots for historical
project health, task update staleness, unanswered comment threads, deleted or
changed template-generated tasks, per-project storage bytes, or notification
delivery failures. These indicators require event/snapshot instrumentation
before they can be reported accurately. The dashboard does not present them as
zero.

## Verification evidence

- Database fixture manual calculation: 1 overdue task; 1 due in the next 7
  calendar days; on-time completion is 1/2 = 50%; one return from two
  submissions is 50%; assignment response is 30 minutes. The dashboard DB
  test asserts each value.
- A department head fixture scoped to department A returns no project or
  individual workload from department B and rejects an explicit department B
  filter. A separate branch-scope test checks that people in another branch
  are not returned when a branch is selected.
- A project owner can see assigned workload only for their own project's
  members, and that individual access is audited.
- The web test compares task-status values in chart and table modes row by row.
- `RUN_DASHBOARD_BENCHMARK=1` seeds 100,000 tasks and asserts an elapsed-time
  budget controlled by `DASHBOARD_BENCHMARK_MAX_MS`. On the local configured
  PostgreSQL test database, the latest measured dashboard query was 638 ms with a
  5,000 ms budget. This is a local test measurement, not a production SLA.
