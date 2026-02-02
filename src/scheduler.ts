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
} from "./state";

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
      try {
        const now = getNZDate();
        if (!isFirstOrThirdMonday(now)) {
          console.log(`Skipping Monday task - not 1st or 3rd Monday (day ${now.getDate()})`);
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
        }
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Sprint Kickoff task:", error);
      }
    });

    // Bi-weekly Friday 3:30pm NZT - Sprint review
    const fridayRule = new RecurrenceRule();
    fridayRule.dayOfWeek = 5;
    fridayRule.hour = 15;
    fridayRule.minute = 30;
    fridayRule.tz = "Pacific/Auckland";

    scheduledJobs.friday = scheduleJob("Friday 3:30pm", fridayRule, async () => {
      try {
        const now = getNZDate();
        if (!isSecondOrFourthFriday(now)) {
          console.log(`Skipping Friday task - not 2nd or 4th Friday (day ${now.getDate()})`);
          return;
        }
        console.log(`Executing Sprint Review at ${formatDate(now)} (day ${now.getDate()})`);
        await retryScheduledTask(
          "Sprint Review",
          "*Sprint Review* 🔍\n\n👉 How did you do on your sprint goals?\n\nShare your wins, learnings, and let's celebrate our growth! 🎉",
          BOT_CONFIG.TARGET_GROUP_ID
        );
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Sprint Review task:", error);
      }
    });

    // Demo day - second Saturday of month
    const demoRule = new RecurrenceRule();
    demoRule.dayOfWeek = 6;
    demoRule.hour = 10;
    demoRule.minute = 0;
    demoRule.tz = "Pacific/Auckland";

    scheduledJobs.demo = scheduleJob("Demo Day", demoRule, async () => {
      try {
        const now = getNZDate();
        if (!isSecondSaturday(now)) {
          console.log(`Skipping Demo Day - not second Saturday (day ${now.getDate()})`);
          return;
        }
        console.log(`Executing Demo Day at ${formatDate(now)}`);
        await retryScheduledTask(
          "Demo Day",
          "*Demo Day* 🎬\n\n👉 Share what you've been cooking up!\n\nThere is no specific format. Could be a short vid, link, screenshot or picture. 🏆",
          BOT_CONFIG.TARGET_GROUP_ID
        );
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Demo Day task:", error);
      }
    });

    // Mid-sprint check-in
    const checkInRule = new RecurrenceRule();
    checkInRule.dayOfWeek = 3;
    checkInRule.hour = 9;
    checkInRule.minute = 0;
    checkInRule.tz = "Pacific/Auckland";

    scheduledJobs.checkIn = scheduleJob("Mid-sprint Check-in", checkInRule, async () => {
      try {
        const now = getNZDate();
        if (!isSecondOrFourthWednesday(now)) {
          console.log(`Skipping check-in - not 2nd or 4th Wednesday (day ${now.getDate()})`);
          return;
        }
        console.log(`Executing Mid-sprint Check-in at ${formatDate(now)} (day ${now.getDate()})`);
        const usersWithGoals = await getUsersWithActiveGoals();
        const msg =
          usersWithGoals.length === 0
            ? "*Mid-Sprint Check-in* 📊\n\nHow's everyone tracking on their goals? Drop an update below! 👇"
            : "*Mid-Sprint Check-in* 📊\n\nWe're halfway through the sprint! How's everyone tracking?\n\n👉 Share a quick update on your progress 👇";
        await retryScheduledTask("Mid-sprint Check-in", msg, BOT_CONFIG.TARGET_GROUP_ID);
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Mid-sprint Check-in task:", error);
      }
    });

    // Month end
    scheduledJobs.monthEnd = scheduleJob("0 9 * * *", async () => {
      try {
        const now = getNZDate();
        if (isLastDayOfMonth(now)) {
          console.log(`Executing month-end task at ${formatDate(now)}`);
          await retryScheduledTask(
            "Monthly celebration",
            "*Monthly Celebration* 🎊\n\nAs we close out the month, take a moment to reflect on your accomplishments!\n\nBe proud of what you've achieved ✨",
            BOT_CONFIG.TARGET_GROUP_ID
          );
        }
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in month-end task:", error);
      }
    });

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
  setSchedulerActive(false);
  botStatus.isActive = false;
  botStatus.scheduledTasksCount = 0;
  botStatus.nextScheduledTasks = [];
};
