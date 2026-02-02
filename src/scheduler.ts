// Scheduled message setup and management
import type { GroupChat } from "whatsapp-web.js";
const { scheduleJob, RecurrenceRule } = require("node-schedule");

import { BOT_CONFIG } from "./config";
import {
  formatDate,
  isFirstOrThirdMonday,
  isSecondOrFourthFriday,
  isSecondOrFourthWednesday,
  isSecondSaturday,
  isLastDayOfMonth,
  getNZDate,
} from "./utils";
import { retryScheduledTask } from "./client";
import { getUsersWithActiveGoals } from "./goalStore";
import {
  schedulerActive,
  setSchedulerActive,
  scheduledJobs,
  botStatus,
  updateNextScheduledTasks,
  setLastKickoff,
  clearScheduledJobs,
  setMissedJobsCache,
} from "./state";
import {
  recordJobFired,
  recordJobSkipped,
  recordJobCompleted,
  recordJobFailed,
  updateHeartbeat,
  getSchedulerState,
  recordMissedJob,
  getMissedJobs,
} from "./jobTracker";
import type { JobType } from "./dateCalculator";
import {
  getNextFirstOrThirdMonday,
  getNextSecondOrFourthFriday,
  getNextSecondOrFourthWednesday,
  getNextSecondSaturday,
  getNextMonthEnd,
} from "./dateCalculator";

let heartbeatInterval: NodeJS.Timeout | null = null;

export const setupScheduledMessages = async (initialGroupChat: GroupChat) => {
  if (schedulerActive) {
    clearScheduledJobs();
  }

  if (!BOT_CONFIG.TARGET_GROUP_ID) {
    BOT_CONFIG.TARGET_GROUP_ID = initialGroupChat.id._serialized;
    botStatus.targetGroup = initialGroupChat.id._serialized;
    botStatus.targetGroupName = initialGroupChat.name;
    console.log(`Set target group to: ${initialGroupChat.name} (${initialGroupChat.id._serialized})`);
  }

  try {
    // Bi-weekly Monday 9am NZT - Sprint kickoff
    const mondayRule = new RecurrenceRule();
    mondayRule.dayOfWeek = 1;
    mondayRule.hour = 9;
    mondayRule.minute = 0;
    mondayRule.tz = "Pacific/Auckland";

    scheduledJobs.monday = scheduleJob("Monday 9am", mondayRule, async () => {
      const now = getNZDate();
      const scheduledFor = new Date(now);
      scheduledFor.setHours(9, 0, 0, 0);
      const runId = await recordJobFired("monday", scheduledFor);
      
      try {
        if (!isFirstOrThirdMonday(now)) {
          await recordJobSkipped(runId, `Not 1st or 3rd Monday (day ${now.getDate()})`);
          return;
        }
        console.log(`Executing Sprint Kickoff at ${formatDate(now)} (day ${now.getDate()})`);
        const kickoffMsg = await retryScheduledTask(
          "Sprint Kickoff",
          "*Sprint Kickoff* 🚀\n\n👉 What are your main goals for the next 2 weeks?\n\nShare below and let's crush this sprint together! 💪",
          BOT_CONFIG.TARGET_GROUP_ID
        );
        if (kickoffMsg) {
          setLastKickoff(kickoffMsg.id._serialized, new Date());
          console.log(`Tracking kickoff message: ${kickoffMsg.id._serialized}`);
          await recordJobCompleted(runId, kickoffMsg.id._serialized);
        } else {
          await recordJobCompleted(runId);
        }
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Sprint Kickoff task:", error);
        await recordJobFailed(runId, String(error));
      }
    });

    // Bi-weekly Friday 3:30pm NZT - Sprint review
    const fridayRule = new RecurrenceRule();
    fridayRule.dayOfWeek = 5;
    fridayRule.hour = 15;
    fridayRule.minute = 30;
    fridayRule.tz = "Pacific/Auckland";

    scheduledJobs.friday = scheduleJob("Friday 3:30pm", fridayRule, async () => {
      const now = getNZDate();
      const scheduledFor = new Date(now);
      scheduledFor.setHours(15, 30, 0, 0);
      const runId = await recordJobFired("friday", scheduledFor);
      
      try {
        if (!isSecondOrFourthFriday(now)) {
          await recordJobSkipped(runId, `Not 2nd or 4th Friday (day ${now.getDate()})`);
          return;
        }
        console.log(`Executing Sprint Review at ${formatDate(now)} (day ${now.getDate()})`);
        const msg = await retryScheduledTask(
          "Sprint Review",
          "*Sprint Review* 🔍\n\n👉 How did you do on your sprint goals?\n\nShare your wins, learnings, and let's celebrate our growth! 🎉",
          BOT_CONFIG.TARGET_GROUP_ID
        );
        await recordJobCompleted(runId, msg?.id?._serialized);
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Sprint Review task:", error);
        await recordJobFailed(runId, String(error));
      }
    });

    // Demo day - second Saturday of month
    const demoRule = new RecurrenceRule();
    demoRule.dayOfWeek = 6;
    demoRule.hour = 10;
    demoRule.minute = 0;
    demoRule.tz = "Pacific/Auckland";

    scheduledJobs.demo = scheduleJob("Demo Day", demoRule, async () => {
      const now = getNZDate();
      const scheduledFor = new Date(now);
      scheduledFor.setHours(10, 0, 0, 0);
      const runId = await recordJobFired("demo", scheduledFor);
      
      try {
        if (!isSecondSaturday(now)) {
          await recordJobSkipped(runId, `Not second Saturday (day ${now.getDate()})`);
          return;
        }
        console.log(`Executing Demo Day at ${formatDate(now)}`);
        const msg = await retryScheduledTask(
          "Demo Day",
          "*Demo Day* 🎬\n\n👉 Share what you've been cooking up!\n\nThere is no specific format. Could be a short vid, link, screenshot or picture. 🏆",
          BOT_CONFIG.TARGET_GROUP_ID
        );
        await recordJobCompleted(runId, msg?.id?._serialized);
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Demo Day task:", error);
        await recordJobFailed(runId, String(error));
      }
    });

    // Mid-sprint check-in
    const checkInRule = new RecurrenceRule();
    checkInRule.dayOfWeek = 3;
    checkInRule.hour = 9;
    checkInRule.minute = 0;
    checkInRule.tz = "Pacific/Auckland";

    scheduledJobs.checkIn = scheduleJob("Mid-sprint Check-in", checkInRule, async () => {
      const now = getNZDate();
      const scheduledFor = new Date(now);
      scheduledFor.setHours(9, 0, 0, 0);
      const runId = await recordJobFired("checkIn", scheduledFor);
      
      try {
        if (!isSecondOrFourthWednesday(now)) {
          await recordJobSkipped(runId, `Not 2nd or 4th Wednesday (day ${now.getDate()})`);
          return;
        }
        console.log(`Executing Mid-sprint Check-in at ${formatDate(now)} (day ${now.getDate()})`);
        const usersWithGoals = await getUsersWithActiveGoals();
        const msgText =
          usersWithGoals.length === 0
            ? "*Mid-Sprint Check-in* 📊\n\nHow's everyone tracking on their goals? Drop an update below! 👇"
            : "*Mid-Sprint Check-in* 📊\n\nWe're halfway through the sprint! How's everyone tracking?\n\n👉 Share a quick update on your progress 👇";
        const msg = await retryScheduledTask("Mid-sprint Check-in", msgText, BOT_CONFIG.TARGET_GROUP_ID);
        await recordJobCompleted(runId, msg?.id?._serialized);
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Mid-sprint Check-in task:", error);
        await recordJobFailed(runId, String(error));
      }
    });

    // Month end
    scheduledJobs.monthEnd = scheduleJob("0 9 * * *", async () => {
      const now = getNZDate();
      
      if (!isLastDayOfMonth(now)) {
        return;
      }
      
      const scheduledFor = new Date(now);
      scheduledFor.setHours(9, 0, 0, 0);
      const runId = await recordJobFired("monthEnd", scheduledFor);
      
      try {
        console.log(`Executing month-end task at ${formatDate(now)}`);
        const msg = await retryScheduledTask(
          "Monthly celebration",
          "*Monthly Celebration* 🎊\n\nAs we close out the month, take a moment to reflect on your accomplishments!\n\nBe proud of what you've achieved ✨",
          BOT_CONFIG.TARGET_GROUP_ID
        );
        await recordJobCompleted(runId, msg?.id?._serialized);
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in month-end task:", error);
        await recordJobFailed(runId, String(error));
      }
    });

    // Start heartbeat interval (every 60 seconds)
    startHeartbeat();

    setSchedulerActive(true);
    botStatus.isActive = true;
    botStatus.scheduledTasksCount = Object.keys(scheduledJobs).length;
    updateNextScheduledTasks();
    return true;
  } catch (error) {
    console.error("Error setting up scheduled messages:", error);
    return false;
  }
};

export const stopScheduler = () => {
  clearScheduledJobs();
  stopHeartbeat();
  setSchedulerActive(false);
  botStatus.isActive = false;
  botStatus.scheduledTasksCount = 0;
  botStatus.nextScheduledTasks = [];
};

function startHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  heartbeatInterval = setInterval(async () => {
    try {
      await updateHeartbeat();
    } catch (error) {
      console.error("[Scheduler] Heartbeat error:", error);
    }
  }, 60000);
  // Also update immediately
  updateHeartbeat().catch((e) => console.error("[Scheduler] Initial heartbeat error:", e));
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export async function checkMissedJobs(): Promise<void> {
  console.log("[Scheduler] Checking for missed jobs...");
  
  const state = await getSchedulerState();
  if (!state) {
    console.log("[Scheduler] No previous scheduler state found - first run");
    await updateHeartbeat();
    return;
  }
  
  const now = getNZDate();
  const lastHeartbeat = state.lastHeartbeat;
  const downtime = now.getTime() - lastHeartbeat.getTime();
  const downtimeHours = Math.round(downtime / (1000 * 60 * 60) * 10) / 10;
  
  if (downtime < 60000) {
    console.log("[Scheduler] Bot was only offline briefly, no missed jobs check needed");
    return;
  }
  
  console.log(`[Scheduler] Bot was offline for ${downtimeHours} hours (since ${lastHeartbeat.toISOString()})`);
  
  // Check each job type for missed posts during downtime
  const jobCheckers: Array<{ type: JobType; getNext: (d: Date) => Date; checker: (d: Date) => boolean }> = [
    { type: "monday", getNext: getNextFirstOrThirdMonday, checker: isFirstOrThirdMonday },
    { type: "friday", getNext: getNextSecondOrFourthFriday, checker: isSecondOrFourthFriday },
    { type: "demo", getNext: getNextSecondSaturday, checker: isSecondSaturday },
    { type: "checkIn", getNext: getNextSecondOrFourthWednesday, checker: isSecondOrFourthWednesday },
  ];
  
  for (const { type, getNext, checker } of jobCheckers) {
    // Find scheduled dates between lastHeartbeat and now
    let candidate = new Date(lastHeartbeat);
    candidate.setHours(0, 0, 0, 0);
    
    while (candidate < now) {
      if (checker(candidate)) {
        const scheduledTime = getNext(candidate);
        if (scheduledTime > lastHeartbeat && scheduledTime < now) {
          await recordMissedJob(type, scheduledTime);
        }
      }
      candidate.setDate(candidate.getDate() + 1);
    }
  }
  
  // Check for month-end during downtime
  let monthEndCandidate = new Date(lastHeartbeat);
  monthEndCandidate.setHours(0, 0, 0, 0);
  while (monthEndCandidate < now) {
    if (isLastDayOfMonth(monthEndCandidate)) {
      const scheduledTime = new Date(monthEndCandidate);
      scheduledTime.setHours(9, 0, 0, 0);
      if (scheduledTime > lastHeartbeat && scheduledTime < now) {
        await recordMissedJob("monthEnd", scheduledTime);
      }
    }
    monthEndCandidate.setDate(monthEndCandidate.getDate() + 1);
  }
  
  // Update missed jobs cache
  const missedJobs = await getMissedJobs();
  setMissedJobsCache(missedJobs);
  
  if (missedJobs.length > 0) {
    console.log(`[Scheduler] Found ${missedJobs.length} missed job(s)`);
    missedJobs.forEach((job) => {
      console.log(`  - ${job.jobType}: ${job.scheduledFor.toISOString()}`);
    });
  } else {
    console.log("[Scheduler] No missed jobs found");
  }
  
  await updateHeartbeat();
}
