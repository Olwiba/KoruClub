// Admin-only command handlers
import type { Chat, GroupChat } from "whatsapp-web.js";

import { BOT_CONFIG } from "../config";
import { getAdminStats, addGoals } from "../goalStore";
import { isLLMReady, adminChat, extractGoals } from "../llm";
import { getClient } from "../client";

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

// Handle !bot users command - list group members with IDs
export const handleUsersCommand = async (chat: Chat) => {
  try {
    const client = getClient();
    if (!client) {
      await chat.sendMessage("❌ Client not available.");
      return;
    }

    if (!BOT_CONFIG.TARGET_GROUP_ID) {
      await chat.sendMessage("❌ No target group set. Use !bot start in a group first.");
      return;
    }

    const targetChat = await client.getChatById(BOT_CONFIG.TARGET_GROUP_ID);
    if (!targetChat.isGroup) {
      await chat.sendMessage("❌ Target is not a group chat.");
      return;
    }

    const groupChat = targetChat as GroupChat;
    const participants = groupChat.participants;

    if (!participants || participants.length === 0) {
      await chat.sendMessage("❌ Could not fetch group participants.");
      return;
    }

    // Get contact info for each participant
    const userList: string[] = [];
    for (const participant of participants) {
      try {
        const contact = await client.getContactById(participant.id._serialized);
        const name = contact.pushname || contact.name || contact.shortName || "Unknown";
        const isAdmin = participant.isAdmin || participant.isSuperAdmin ? " (Admin)" : "";
        userList.push(`${participant.id._serialized} - ${name}${isAdmin}`);
      } catch {
        userList.push(`${participant.id._serialized} - Unknown`);
      }
    }

    const response =
      `*👥 Group Members (${groupChat.name})*\n\n` +
      `_Copy the ID to use with !bot ingest_\n\n` +
      userList.join("\n");

    await chat.sendMessage(response);
  } catch (error) {
    console.error("Error listing users:", error);
    await chat.sendMessage("❌ Failed to fetch group members. Check server logs.");
  }
};

// Handle !bot ingest <userId>\n<message> command - manually ingest goals for a user
export const handleIngestCommand = async (chat: Chat, content: string) => {
  // Extract content after "!bot ingest "
  const ingestContent = content.slice(BOT_CONFIG.INGEST_COMMAND.length).trim();

  if (!ingestContent) {
    await chat.sendMessage(
      `*📥 Manual Goal Ingest*\n\n` +
        `Use this to manually add goals for a user.\n\n` +
        `*Format:*\n` +
        `${BOT_CONFIG.INGEST_COMMAND} <userId>\n` +
        `<paste message content>\n\n` +
        `*Example:*\n` +
        `${BOT_CONFIG.INGEST_COMMAND} 447123456789@c.us\n` +
        `Goals for this week:\n` +
        `- Finish the landing page\n` +
        `- Fix the auth bug\n\n` +
        `_Use ${BOT_CONFIG.USERS_COMMAND} to get user IDs_`
    );
    return;
  }

  // Parse userId (first line) and message content (rest)
  const lines = ingestContent.split("\n");
  const userId = lines[0].trim();
  const messageContent = lines.slice(1).join("\n").trim();

  if (!userId || !userId.includes("@")) {
    await chat.sendMessage(
      `❌ Invalid user ID format.\n\n` +
        `Expected format: 447123456789@c.us\n` +
        `_Use ${BOT_CONFIG.USERS_COMMAND} to get valid user IDs_`
    );
    return;
  }

  if (!messageContent) {
    await chat.sendMessage(
      `❌ No message content provided.\n\n` +
        `Please paste the user's message after the user ID on a new line.`
    );
    return;
  }

  if (!isLLMReady()) {
    await chat.sendMessage("❌ AI isn't available right now. Try again later!");
    return;
  }

  await chat.sendMessage("🔍 _Extracting goals from message..._");

  try {
    const extractedGoals = await extractGoals(messageContent);

    if (extractedGoals.length === 0) {
      await chat.sendMessage(
        `❌ Could not extract any goals from the message.\n\n` +
          `Try ensuring the message contains clear goals or tasks.`
      );
      return;
    }

    await addGoals(userId, extractedGoals);

    const goalsList = extractedGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");
    await chat.sendMessage(
      `✅ *Goals ingested for user*\n\n` +
        `👤 User: ...${userId.slice(-12)}\n\n` +
        `📋 *Goals added:*\n${goalsList}\n\n` +
        `_These goals are now tracked for the current sprint._`
    );
  } catch (error) {
    console.error("Error ingesting goals:", error);
    await chat.sendMessage("❌ Failed to ingest goals. Check server logs.");
  }
};
