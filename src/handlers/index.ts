// Main message router
import type { Message } from "whatsapp-web.js";

import { BOT_CONFIG, adminChatId, targetGroupId } from "../config";
import { botStatus } from "../state";
import {
  handleStartCommand,
  handleStopCommand,
  handleStatusCommand,
  handleHelpCommand,
  handleSayCommand,
  handleMondayCommand,
  handleFridayCommand,
  handleDemoCommand,
  handleMonthlyCommand,
} from "./commands";

const GOAL_PATTERNS: RegExp[] = [
  /\bmy goals?\b/i,
  /\bgoals?\s*[:\-]/i,
  /\b(?:this|next)\s+(?:week|sprint|fortnight)\s+i(?:'m| am)?\s*(?:will|gonna|going to)\b/i,
  /\bi(?:'m| am)?\s*(?:going to|gonna|will)\b.*\b(?:build|ship|finish|complete|launch|publish|write|learn|practice|exercise|study)\b/i,
  /(?:^|\n)\s*(?:[-*•]\s+|\d+[.)]\s+).{6,}/,
];

const COMPLETION_PATTERNS: RegExp[] = [
  /\b(?:done|finished|completed)\b/i,
  /\b(?:shipped|launched|deployed|published)\b/i,
  /\b(?:wrapped up|knocked out|ticked off)\b/i,
  /\b(?:made progress|progress update)\b/i,
  /\b(?:i(?:'ve| have)\s+(?:done|finished|completed|shipped|launched|deployed))\b/i,
];

const looksLikeGoalSettingMessage = (content: string): boolean => {
  const text = content.trim();
  if (text.length < 8) return false;
  return GOAL_PATTERNS.some((pattern) => pattern.test(text));
};

const looksLikeGoalCompletionMessage = (content: string): boolean => {
  const text = content.trim();
  if (text.length < 6) return false;
  return COMPLETION_PATTERNS.some((pattern) => pattern.test(text));
};

export const handleMessage = async (message: Message) => {
  if (message.fromMe) return;

  try {
    const chat = await message.getChat();
    const content = message.body.trim();
    const isGroupMessage = message.from.endsWith("@g.us");
    const isDirectMessage = !isGroupMessage;

    // Debug: log incoming DM chat IDs
    if (isDirectMessage) {
      console.log(`[DEBUG] DM from: ${message.from}`);
    }

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
      } else if (!content.startsWith(BOT_CONFIG.COMMAND_PREFIX)) {
        if (looksLikeGoalCompletionMessage(content)) {
          await message.react("💪");
        } else if (looksLikeGoalSettingMessage(content)) {
          await message.react("🎯");
        }
      }
    } else if (isDirectMessage) {
      // Admin DM commands
      if (content === BOT_CONFIG.STATUS_COMMAND) {
        await handleStatusCommand(chat);
      } else if (content === BOT_CONFIG.HELP_COMMAND) {
        await handleHelpCommand(chat, true);
      } else if (content.startsWith(BOT_CONFIG.SAY_COMMAND)) {
        await handleSayCommand(chat, content);
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
};
