// Admin-only command handlers
import type { Chat } from "whatsapp-web.js";

import { BOT_CONFIG } from "../config";
import { getAdminStats } from "../goalStore";
import { isLLMReady, adminChat } from "../llm";

// Handle !bot stats command - show aggregate goal tracking statistics
export const handleStatsCommand = async (chat: Chat) => {
  try {
    const stats = await getAdminStats();

    const topPerformersText =
      stats.topPerformers.length > 0
        ? stats.topPerformers.map((p, i) => `  ${i + 1}. ...${p.userId.slice(-6)}: ${p.completionRate}%`).join("\n")
        : "  No users with 3+ goals yet";

    const statsText =
      `*📈 Goal Tracking Stats*\n\n` +
      `*Overall:*\n` +
      `👥 Total users: ${stats.totalUsers}\n` +
      `🎯 Total goals: ${stats.totalGoals}\n` +
      `✅ Completed: ${stats.completedGoals} (${stats.overallCompletionRate}%)\n` +
      `🔄 Active: ${stats.activeGoals}\n` +
      `⏭️ Carried over: ${stats.carriedOverGoals}\n\n` +
      `*Current Sprint (#${stats.currentSprintNumber}):*\n` +
      `📝 Goals set: ${stats.currentSprintStats.goals}\n` +
      `✅ Completed: ${stats.currentSprintStats.completed}\n` +
      `👤 Active users: ${stats.currentSprintStats.activeUsers}\n\n` +
      `*Last 7 Days:*\n` +
      `📝 Goals set: ${stats.recentActivity.goalsSetLast7Days}\n` +
      `✅ Completed: ${stats.recentActivity.goalsCompletedLast7Days}\n\n` +
      `*Top Performers (by completion rate):*\n${topPerformersText}`;

    await chat.sendMessage(statsText);
  } catch (error) {
    console.error("Error getting admin stats:", error);
    await chat.sendMessage("❌ Failed to retrieve stats. Check server logs.");
  }
};

// Handle !bot chat <message> command - have a conversation with the LLM about DB data
export const handleChatCommand = async (chat: Chat, content: string) => {
  // Extract the message after "!bot chat "
  const chatMessage = content.slice(BOT_CONFIG.CHAT_COMMAND.length).trim();

  if (!chatMessage) {
    await chat.sendMessage(
      `💬 *Admin Chat*\n\nAsk me anything about the goal tracking data!\n\n` +
        `Examples:\n` +
        `• _${BOT_CONFIG.CHAT_COMMAND} How many goals were completed this sprint?_\n` +
        `• _${BOT_CONFIG.CHAT_COMMAND} Who are the most active users?_\n` +
        `• _${BOT_CONFIG.CHAT_COMMAND} What kinds of goals do people set?_\n` +
        `• _${BOT_CONFIG.CHAT_COMMAND} Any patterns in carried over goals?_`
    );
    return;
  }

  if (!isLLMReady()) {
    await chat.sendMessage("🤖 AI isn't available right now. Try again later!");
    return;
  }

  await chat.sendMessage("🤔 _Analyzing the data..._");

  try {
    const response = await adminChat(chatMessage);
    await chat.sendMessage(`💬 ${response}`);
  } catch (error) {
    console.error("Error in admin chat:", error);
    await chat.sendMessage("❌ Sorry, I couldn't process that question. Try rephrasing?");
  }
};
