// Bot command handlers for group chat
import type { Chat, GroupChat } from "whatsapp-web.js";

import { BOT_CONFIG } from "../config";
import { botStatus, schedulerActive, setLastKickoff } from "../state";
import { setupScheduledMessages, stopScheduler } from "../scheduler";

export const handleStartCommand = async (chat: Chat) => {
  if (schedulerActive) {
    await chat.sendMessage("🤖 I'm already running! The scheduled message service is active.");
  } else {
    const success = await setupScheduledMessages(chat as GroupChat);
    await chat.sendMessage(
      success
        ? "📆 Scheduled message service started! I will now post regular updates according to the schedule."
        : "❌ Failed to start scheduled message service. Please check server logs."
    );
  }
};

export const handleStopCommand = async (chat: Chat) => {
  if (!schedulerActive) {
    await chat.sendMessage("🤖 I'm not currently running any scheduled messages.");
  } else {
    stopScheduler();
    await chat.sendMessage("🛑 Scheduled message service stopped.");
  }
};

export const handleStatusCommand = async (chat: Chat) => {
  const status =
    `*Bot Status Report*\n\n` +
    `🤖 Active: ${botStatus.isActive ? "Yes ✅" : "No ❌"}\n` +
    `⏱️ Uptime: ${botStatus.uptime()}\n` +
    `👥 Target Group: ${botStatus.targetGroupName || "Not set"}\n` +
    `📊 Scheduled Tasks: ${botStatus.scheduledTasksCount}\n\n` +
    `*Upcoming Messages:*\n${
      botStatus.nextScheduledTasks.length
        ? botStatus.nextScheduledTasks.map((task) => `- ${task}`).join("\n")
        : "No upcoming messages scheduled."
    }`;

  await chat.sendMessage(status);
};

export const handleHelpCommand = async (chat: Chat, isAdmin: boolean = false) => {
  if (isAdmin) {
    const helpText =
      `*Admin Commands (Direct Message)*\n\n` +
      `📊 *${BOT_CONFIG.STATUS_COMMAND}* - Show bot status\n` +
      `🛟 *${BOT_CONFIG.HELP_COMMAND}* - Show this help\n\n` +
      `*Note:* Start/stop commands must be used in the target group chat.`;
    await chat.sendMessage(helpText);
  } else {
    const helpText =
      `*Available Commands*\n\n` +
      `📝 *${BOT_CONFIG.START_COMMAND}* - Start scheduled messaging\n` +
      `📊 *${BOT_CONFIG.STATUS_COMMAND}* - Show bot status\n` +
      `🛟 *${BOT_CONFIG.HELP_COMMAND}* - Show this help\n` +
      `🛑 *${BOT_CONFIG.STOP_COMMAND}* - Stop scheduled messaging\n` +
      `📅 *${BOT_CONFIG.MONDAY_COMMAND}* - Trigger Sprint Kickoff\n` +
      `📅 *${BOT_CONFIG.FRIDAY_COMMAND}* - Trigger Sprint Review\n` +
      `📅 *${BOT_CONFIG.DEMO_COMMAND}* - Trigger Demo Day\n` +
      `📅 *${BOT_CONFIG.MONTHLY_COMMAND}* - Trigger Monthly Celebration`;
    await chat.sendMessage(helpText);
  }
};

export const handleMondayCommand = async (chat: Chat) => {
  const kickoffMsg = await chat.sendMessage(
    "*Sprint Kickoff* 🚀\n\n👉 What are your main goals for the next 2 weeks?\n\nShare below and let's crush this sprint together! 💪"
  );
  setLastKickoff(kickoffMsg.id._serialized, new Date());
};

export const handleFridayCommand = async (chat: Chat) => {
  await chat.sendMessage(
    "*Sprint Review* 🔍\n\n👉 How did you do on your sprint goals?\n\nShare your wins, learnings, and let's celebrate our growth! 🎉"
  );
};

export const handleDemoCommand = async (chat: Chat) => {
  await chat.sendMessage(
    "*Demo day*\n\n👉 Share what you've been cooking up!\n\nThere is no specific format. Could be a short vid, link, screenshot or picture. 🏆"
  );
};

export const handleMonthlyCommand = async (chat: Chat) => {
  await chat.sendMessage(
    "*Monthly Celebration* 🎊\n\nAs we close out the month, take a moment to reflect on your accomplishments!\n\nBe proud of what you've achieved ✨"
  );
};
