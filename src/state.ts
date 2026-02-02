// Global bot state management
import { getActualNextPostDates, getJobLabel } from "./dateCalculator";
import type { JobRun } from "./jobTracker";

// Scheduler state
export let schedulerActive = false;
export const scheduledJobs: Record<string, any> = {};
export let botStartTime: Date | null = null;

// Kickoff tracking
export let lastKickoffMessageId: string | null = null;
export let lastKickoffTime: Date | null = null;

// Missed jobs cache (updated on startup and after missed job detection)
export let missedJobsCache: JobRun[] = [];

// Setters
export const setSchedulerActive = (active: boolean) => {
  schedulerActive = active;
};

export const setBotStartTime = (time: Date | null) => {
  botStartTime = time;
};

export const setLastKickoff = (messageId: string | null, time: Date | null) => {
  lastKickoffMessageId = messageId;
  lastKickoffTime = time;
};

export const setMissedJobsCache = (jobs: JobRun[]) => {
  missedJobsCache = jobs;
};

export const clearScheduledJobs = () => {
  Object.values(scheduledJobs).forEach((job) => job.cancel());
  Object.keys(scheduledJobs).forEach((key) => delete scheduledJobs[key]);
};

// Bot status object
export const botStatus = {
  isActive: false,
  targetGroup: "",
  targetGroupName: "",
  scheduledTasksCount: 0,
  uptime: function () {
    if (!botStartTime) return "0 minutes";
    const diffMs = Date.now() - botStartTime.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffDays} days, ${diffHrs} hours, ${diffMins} minutes`;
  },
  nextScheduledTasks: [] as string[],
  missedJobsDisplay: [] as string[],
};

export const updateNextScheduledTasks = () => {
  // Get actual next post dates (not when jobs fire)
  const nextDates = getActualNextPostDates();
  
  botStatus.nextScheduledTasks = nextDates.map((d) => {
    const dateStr = d.nextDate.toLocaleString("en-NZ", {
      timeZone: "Pacific/Auckland",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `${d.label}: ${dateStr}`;
  });
  
  // Update missed jobs display
  botStatus.missedJobsDisplay = missedJobsCache.map((job) => {
    const dateStr = job.scheduledFor.toLocaleDateString("en-NZ", {
      timeZone: "Pacific/Auckland",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const command = getCommandForJobType(job.jobType);
    return `${getJobLabel(job.jobType as any)}: ${dateStr} (use ${command})`;
  });
};

function getCommandForJobType(jobType: string): string {
  switch (jobType) {
    case "monday":
      return "!bot monday";
    case "friday":
      return "!bot friday";
    case "demo":
      return "!bot demo";
    case "checkIn":
      return "!bot monday"; // No direct command for check-in
    case "monthEnd":
      return "!bot monthly";
    default:
      return "!bot help";
  }
}
