// Track scheduled job executions in database
import { db } from "./db";
import type { JobType } from "./dateCalculator";
import { getMostRecentScheduledDate, getJobLabel } from "./dateCalculator";
import { getNZDate } from "./utils";

export interface JobRun {
  id: string;
  jobType: string;
  scheduledFor: Date;
  status: string;
  executedAt: Date | null;
  skippedReason: string | null;
  messageId: string | null;
  error: string | null;
}

export async function recordJobFired(jobType: JobType, scheduledFor: Date): Promise<string> {
  const run = await db.scheduledJobRun.create({
    data: {
      jobType,
      scheduledFor,
      status: "pending",
    },
  });
  console.log(`[JobTracker] Job fired: ${jobType} scheduled for ${scheduledFor.toISOString()}`);
  return run.id;
}

export async function recordJobSkipped(runId: string, reason: string): Promise<void> {
  await db.scheduledJobRun.update({
    where: { id: runId },
    data: {
      status: "skipped",
      skippedReason: reason,
      executedAt: new Date(),
    },
  });
  console.log(`[JobTracker] Job skipped: ${runId} - ${reason}`);
}

export async function recordJobCompleted(runId: string, messageId?: string): Promise<void> {
  await db.scheduledJobRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      executedAt: new Date(),
      messageId: messageId || null,
    },
  });
  console.log(`[JobTracker] Job completed: ${runId}`);
}

export async function recordJobFailed(runId: string, error: string): Promise<void> {
  await db.scheduledJobRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      executedAt: new Date(),
      error,
    },
  });
  console.log(`[JobTracker] Job failed: ${runId} - ${error}`);
}

export async function recordManualTrigger(jobType: JobType, messageId?: string): Promise<boolean> {
  const now = getNZDate();
  
  // Check if there's a missed job of this type that we can resolve
  const missedJob = await db.scheduledJobRun.findFirst({
    where: {
      jobType,
      status: "missed",
    },
    orderBy: {
      scheduledFor: "desc",
    },
  });
  
  if (missedJob) {
    // Resolve the missed job with this manual trigger
    await db.scheduledJobRun.update({
      where: { id: missedJob.id },
      data: {
        status: "manual",
        executedAt: new Date(),
        messageId: messageId || null,
      },
    });
    console.log(`[JobTracker] Missed ${getJobLabel(jobType)} (${missedJob.scheduledFor.toISOString()}) resolved via manual trigger`);
    return true; // A missed job was resolved
  } else {
    // Record as a fresh manual trigger
    await db.scheduledJobRun.create({
      data: {
        jobType,
        scheduledFor: now,
        status: "manual",
        executedAt: new Date(),
        messageId: messageId || null,
      },
    });
    console.log(`[JobTracker] Manual trigger recorded: ${jobType}`);
    return false; // No missed job was resolved
  }
}

export async function getLastSuccessfulRun(jobType: JobType): Promise<JobRun | null> {
  const run = await db.scheduledJobRun.findFirst({
    where: {
      jobType,
      status: { in: ["completed", "manual"] },
    },
    orderBy: {
      executedAt: "desc",
    },
  });
  return run;
}

export async function getMissedJobs(): Promise<JobRun[]> {
  const runs = await db.scheduledJobRun.findMany({
    where: {
      status: "missed",
    },
    orderBy: {
      scheduledFor: "asc",
    },
  });
  return runs;
}

export async function updateHeartbeat(): Promise<void> {
  const now = new Date();
  await db.schedulerState.upsert({
    where: { id: "singleton" },
    update: { lastHeartbeat: now },
    create: {
      id: "singleton",
      lastHeartbeat: now,
      schedulerStarted: now,
    },
  });
}

export async function getSchedulerState(): Promise<{ lastHeartbeat: Date; schedulerStarted: Date } | null> {
  const state = await db.schedulerState.findUnique({
    where: { id: "singleton" },
  });
  return state;
}

export async function recordMissedJob(jobType: JobType, scheduledFor: Date): Promise<void> {
  // Check if we already recorded this missed job
  const existing = await db.scheduledJobRun.findFirst({
    where: {
      jobType,
      scheduledFor,
    },
  });
  
  if (!existing) {
    await db.scheduledJobRun.create({
      data: {
        jobType,
        scheduledFor,
        status: "missed",
      },
    });
    console.log(`[JobTracker] Recorded missed job: ${getJobLabel(jobType)} scheduled for ${scheduledFor.toISOString()}`);
  }
}
