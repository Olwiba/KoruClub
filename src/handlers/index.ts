// Main message router
import type { Message } from "whatsapp-web.js";

import { BOT_CONFIG, adminChatId, targetGroupId } from "../config";
import { botStatus } from "../state";
import {
  handleStartCommand,
  handleStopCommand,
  handleStatusCommand,
  handleHelpCommand,
  handleMondayCommand,
  handleFridayCommand,
  handleDemoCommand,
  handleMonthlyCommand,
  handleGoalsCommand,
  handleMentorCommand,
} from "./commands";
import { handleGoalMessage } from "./goals";
import { handleStatsCommand, handleChatCommand } from "./admin";

export const handleMessage = async (message: Message) => {
  if (message.fromMe) return;

  try {
    const chat = await message.getChat();
    const content = message.body.trim();
    const isGroupMessage = message.from.endsWith("@g.us");
    const isDirectMessage = !isGroupMessage;

    // Only respond to DMs from admin
    if (isDirectMessage && adminChatId && message.from !== adminChatId) {
      return;
    }

    if (isGroupMessage) {
      // If TARGET_GROUP_ID is set in env, only respond to that group
      if (targetGroupId && message.from !== targetGroupId) {
        return;
      }

      // Auto-set target group if not configured
      if (!BOT_CONFIG.TARGET_GROUP_ID) {
        BOT_CONFIG.TARGET_GROUP_ID = targetGroupId || message.from;
        botStatus.targetGroup = BOT_CONFIG.TARGET_GROUP_ID;
        botStatus.targetGroupName = chat.name;
        console.log(`Set target group to: ${chat.name} (${BOT_CONFIG.TARGET_GROUP_ID})`);
      }

      // Route commands
      if (content === BOT_CONFIG.START_COMMAND) {
        await handleStartCommand(chat);
      } else if (content === BOT_CONFIG.STOP_COMMAND) {
        await handleStopCommand(chat);
      } else if (content === BOT_CONFIG.STATUS_COMMAND) {
        await handleStatusCommand(chat);
      } else if (content === BOT_CONFIG.HELP_COMMAND) {
        await handleHelpCommand(chat, false);
      } else if (content === BOT_CONFIG.MONDAY_COMMAND) {
        await handleMondayCommand(chat);
      } else if (content === BOT_CONFIG.FRIDAY_COMMAND) {
        await handleFridayCommand(chat);
      } else if (content === BOT_CONFIG.DEMO_COMMAND) {
        await handleDemoCommand(chat);
      } else if (content === BOT_CONFIG.MONTHLY_COMMAND) {
        await handleMonthlyCommand(chat);
      } else if (content === BOT_CONFIG.GOALS_COMMAND) {
        await handleGoalsCommand(chat, message);
      } else if (content === BOT_CONFIG.MENTOR_COMMAND) {
        await handleMentorCommand(chat, message);
      } else if (!content.startsWith(BOT_CONFIG.COMMAND_PREFIX)) {
        // Non-command message - check for goal-related content
        await handleGoalMessage(message, content);
      }
    } else if (isDirectMessage) {
      // Admin DM commands
      if (content === BOT_CONFIG.STATUS_COMMAND) {
        await handleStatusCommand(chat);
      } else if (content === BOT_CONFIG.HELP_COMMAND) {
        await handleHelpCommand(chat, true);
      } else if (content === BOT_CONFIG.STATS_COMMAND) {
        await handleStatsCommand(chat);
      } else if (content.startsWith(BOT_CONFIG.CHAT_COMMAND)) {
        await handleChatCommand(chat, content);
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
};
