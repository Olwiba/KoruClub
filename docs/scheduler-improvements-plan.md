# Scheduler Improvements: PostgreSQL Persistence & Accurate Status Display

## Summary

Fix the status display to show **actual** next post dates (not when jobs fire), and add database persistence to survive restarts with missed job detection.

**Approach**: Lightweight database tracking (not pg-boss) - right-sized for a small WhatsApp bot.

---

## Changes

### 1. Database Schema (prisma/schema.prisma)

Add two tables:

```prisma
model ScheduledJobRun {
  id            String    @id @default(cuid())
  jobType       String    @map("job_type")      // monday, friday, demo, checkIn, monthEnd
  scheduledFor  DateTime  @map("scheduled_for")
  status        String    @default("pending")   // pending, completed, skipped, failed, missed, manual
  executedAt    DateTime? @map("executed_at")
  skippedReason String?   @map("skipped_reason")
  messageId     String?   @map("message_id")
  error         String?
  createdAt     DateTime  @default(now()) @map("created_at")

  @@index([jobType, scheduledFor])
  @@map("scheduled_job_runs")
}

model SchedulerState {
  id              String   @id @default("singleton")
  lastHeartbeat   DateTime @map("last_heartbeat")
  schedulerStarted DateTime @map("scheduler_started")

  @@map("scheduler_state")
}
```

### 2. New File: src/dateCalculator.ts

Calculate **actual** next post dates by iterating forward until finding dates that match conditions:

- `getNextFirstOrThirdMonday(from: Date): Date`
- `getNextSecondOrFourthWednesday(from: Date): Date`
- `getNextSecondOrFourthFriday(from: Date): Date`
- `getNextSecondSaturday(from: Date): Date`
- `getNextMonthEnd(from: Date): Date`
- `getActualNextPostDates(): Array<{ jobType, nextDate, label }>`
- `getMostRecentScheduledDate(jobType, before: Date): Date` - for manual trigger matching

### 3. New File: src/jobTracker.ts

Track job executions in database:

- `recordJobFired(jobType, scheduledFor)` - when job fires
- `recordJobSkipped(runId, reason)` - when condition not met
- `recordJobCompleted(runId, messageId)` - on success
- `recordJobFailed(runId, error)` - on failure
- `recordManualTrigger(jobType, messageId)` - when user runs !bot monday/friday/etc
- `getLastSuccessfulRun(jobType)` - for status display
- `getMissedJobs()` - get unresolved missed jobs

### 4. Modify: src/scheduler.ts

- Wrap each job execution with tracking calls
- Add heartbeat (update SchedulerState every 60s)
- Add `checkMissedJobs()` on startup to detect gaps

### 5. Modify: src/state.ts

Update `updateNextScheduledTasks()` to use `getActualNextPostDates()` instead of node-schedule's `nextInvocation()`.

### 6. Modify: src/handlers/commands.ts

Update manual trigger commands (`!bot monday`, `!bot friday`, etc.) to:
1. Send the message (existing behavior)
2. Check for any "missed" job of that type in current sprint window
3. If found, update status from "missed" to "manual" with the message ID
4. Log that the missed job was resolved via manual trigger

Example flow:
```
- Bot was down Monday Feb 2 (missed Sprint Kickoff)
- Bot comes online Tuesday Feb 3
- Startup detects missed job, records: { jobType: "monday", scheduledFor: "Feb 2 9am", status: "missed" }
- User runs !bot monday
- System sends kickoff message
- System finds the missed Feb 2 job record
- Updates it to: { status: "manual", executedAt: now, messageId: "..." }
- Logs: "[Scheduler] Missed Sprint Kickoff (Feb 2) resolved via manual trigger"
```

### 7. Modify: src/index.ts

- Call `checkMissedJobs()` after client ready
- Start heartbeat interval

---

## Status Display Before/After

**Before** (confusing - shows when jobs fire, not post):
```
- checkIn: Wed Feb 04 09:00 (will skip - 1st Wed)
- monday: Mon Feb 09 09:00 (will skip - 2nd Mon)
```

**After** (accurate - shows actual post dates):
```
- Mid-Sprint Check-in: Wed Feb 11, 9:00am
- Sprint Review: Fri Feb 13, 3:30pm
- Demo Day: Sat Feb 14, 10:00am
- Sprint Kickoff: Mon Feb 16, 9:00am
- Month End: Sat Feb 28, 9:00am

Missed (needs manual trigger):
- Sprint Kickoff: Mon Feb 2 (use !bot monday)
```

---

## Missed Job Handling

**On startup:**
1. Compare last heartbeat to now
2. Calculate what should have posted in that window
3. Record any gaps as "missed" status

**Manual catch-up:**
- When user runs `!bot monday` (or friday/demo/monthly)
- System checks for recent "missed" job of that type
- If found within current sprint window, marks it as "manual" (resolved)
- This links the manual action to the missed scheduled job

**Not auto-executing** missed jobs (posting "Sprint Kickoff" 3 days late automatically is confusing). User decides when to catch up.

---

## Files Changed

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add 2 tables |
| `src/dateCalculator.ts` | Create (date math) |
| `src/jobTracker.ts` | Create (tracking) |
| `src/scheduler.ts` | Modify (wrap jobs, heartbeat, recovery) |
| `src/state.ts` | Modify (actual dates) |
| `src/index.ts` | Modify (startup recovery) |
| `src/handlers/commands.ts` | Modify (manual trigger links to missed jobs) |

---

## Verification

1. Run `prisma db push` to create tables
2. `!bot start` in group - scheduler should activate
3. `!bot status` should show actual next post dates
4. Restart bot - check logs for "missed job" detection
5. Run `!bot monday` - should resolve any missed monday job
6. Check database: `SELECT * FROM scheduled_job_runs` should have records
