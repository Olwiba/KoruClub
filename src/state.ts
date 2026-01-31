// Global bot state management
import { formatDate } from "./utils";

// Scheduler state
export let schedulerActive = false;
export const scheduledJobs: Record<string, any> = {};
export let botStartTime: Date | null = null;

// Kickoff tracking
export let lastKickoffMessageId: string | null = null;
export let lastKickoffTime: Date | null = null;

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
};

export const updateNextScheduledTasks = () => {
  botStatus.nextScheduledTasks = [];
  Object.entries(scheduledJobs).forEach(([name, job]) => {
    if (job && job.nextInvocation) {
      const nextTime = job.nextInvocation();
      if (nextTime) {
        botStatus.nextScheduledTasks.push(`${name}: ${formatDate(nextTime)}`);
      }
    }
  });
  botStatus.nextScheduledTasks.sort();
};
