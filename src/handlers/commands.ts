// Bot command handlers for group chat
import type { Message, Chat, GroupChat } from "whatsapp-web.js";

import { BOT_CONFIG } from "../config";
import { botStatus, schedulerActive, setLastKickoff, clearScheduledJobs, setSchedulerActive } from "../state";
import { setupScheduledMessages, stopScheduler } from "../scheduler";
import { getActiveGoals, getGoalHistory, getUserStats } from "../goalStore";
import { isLLMReady, generateMentorship } from "../llm";

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
      `📈 *${BOT_CONFIG.STATS_COMMAND}* - View goal tracking stats\n` +
      `💬 *${BOT_CONFIG.CHAT_COMMAND} <message>* - Chat with AI about the data\n` +
      `👥 *${BOT_CONFIG.USERS_COMMAND}* - List group members with IDs\n` +
      `📥 *${BOT_CONFIG.INGEST_COMMAND} <userId>* - Manually ingest goals\n` +
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
      `📅 *${BOT_CONFIG.MONTHLY_COMMAND}* - Trigger Monthly Celebration\n` +
      `📋 *${BOT_CONFIG.GOALS_COMMAND}* - Show your active goals\n` +
      `🧭 *${BOT_CONFIG.MENTOR_COMMAND}* - Get AI mentorship on your goals`;
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

export const handleGoalsCommand = async (chat: Chat, message: Message) => {
  const userId = message.author || message.from;
  const activeGoals = await getActiveGoals(userId);
  
  if (activeGoals.length === 0) {
    await chat.sendMessage(
      "📋 You don't have any active goals yet.\n\nReply to a Sprint Kickoff message to set your goals!"
    );
  } else {
    const goalsList = activeGoals.map((g, i) => `${i + 1}. ${g.text}`).join("\n");
    await chat.sendMessage(
      `*Your Active Goals* 📋\n\n${goalsList}\n\n_Mark as done by posting an update with "done", "finished", or "completed"_`
    );
  }
};

export const handleMentorCommand = async (chat: Chat, message: Message) => {
  const userId = message.author || message.from;

  if (!isLLMReady()) {
    await chat.sendMessage("🤖 AI mentor isn't available right now. Try again later!");
    return;
  }

  const activeGoals = await getActiveGoals(userId);
  const history = await getGoalHistory(userId, 3);
  const stats = await getUserStats(userId);

  if (stats.totalGoals === 0) {
    await chat.sendMessage(
      "🧭 I don't have any goal data for you yet!\n\nSet some goals in the next Sprint Kickoff and I'll be able to provide personalized mentorship."
    );
    return;
  }

  await chat.sendMessage("🧭 _Reviewing your goals and progress..._");

  const mentorship = await generateMentorship({ activeGoals, history, stats });

  if (mentorship) {
    await chat.sendMessage(`*Your Mentor Check-in* 🧭\n\n${mentorship}`);
  } else {
    // Fallback if LLM fails
    const completionEmoji = stats.completionRate >= 70 ? "🔥" : stats.completionRate >= 40 ? "👍" : "💪";
    await chat.sendMessage(
      `*Your Progress* 📊\n\n` +
        `${completionEmoji} Completion rate: ${stats.completionRate}%\n` +
        `🎯 Goals completed: ${stats.completedGoals}/${stats.totalGoals}\n` +
        `🔥 Current streak: ${stats.currentStreak} sprints\n\n` +
        `_Keep pushing! Every step counts._`
    );
  }
};
