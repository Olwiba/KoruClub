// Bot configuration and constants

export const BOT_CONFIG = {
  COMMAND_PREFIX: "!bot",
  START_COMMAND: "!bot start",
  STOP_COMMAND: "!bot stop",
  STATUS_COMMAND: "!bot status",
  HELP_COMMAND: "!bot help",
  SAY_COMMAND: "!bot say",
  MONDAY_COMMAND: "!bot monday",
  FRIDAY_COMMAND: "!bot friday",
  DEMO_COMMAND: "!bot demo",
  MONTHLY_COMMAND: "!bot monthly",
  TARGET_GROUP_ID: "",
};

// Environment
export const adminChatId = process.env.ADMIN_CHAT_ID;
export const targetGroupId = process.env.TARGET_GROUP_ID;
export const autoStartScheduler = (process.env.AUTO_START_SCHEDULER || "true").toLowerCase() === "true";
