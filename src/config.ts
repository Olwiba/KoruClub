// Bot configuration and constants

export const BOT_CONFIG = {
  COMMAND_PREFIX: "!bot",
  START_COMMAND: "!bot start",
  STOP_COMMAND: "!bot stop",
  STATUS_COMMAND: "!bot status",
  HELP_COMMAND: "!bot help",
  MONDAY_COMMAND: "!bot monday",
  FRIDAY_COMMAND: "!bot friday",
  DEMO_COMMAND: "!bot demo",
  MONTHLY_COMMAND: "!bot monthly",
  GOALS_COMMAND: "!bot goals",
  MENTOR_COMMAND: "!bot mentor",
  STATS_COMMAND: "!bot stats",
  CHAT_COMMAND: "!bot chat",
  USERS_COMMAND: "!bot users",
  INGEST_COMMAND: "!bot ingest",
  TARGET_GROUP_ID: "",
};

export const COMPLETION_KEYWORDS = [
  "done",
  "finished",
  "completed",
  "shipped",
  "launched",
  "deployed",
  "✅",
  "🎉",
];

export const KICKOFF_WINDOW_HOURS = 48;

// Environment
export const isProduction = process.env.NODE_ENV === "production";
export const adminChatId = process.env.ADMIN_CHAT_ID;
export const targetGroupId = process.env.TARGET_GROUP_ID;
