const { Client, LocalAuth } = require("whatsapp-web.js");
import type { Message, GroupChat } from "whatsapp-web.js";
const qrcode = require("qrcode-terminal");
const { scheduleJob, RecurrenceRule, Range } = require("node-schedule");
import { createServer } from "http";

// Simple health check server
let isClientReady = false;
const healthServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    const status = isClientReady ? 200 : 503;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: isClientReady ? "ok" : "starting", ready: isClientReady }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(3000, () => console.log("Health server on :3000"));

// Goal tracking imports
import {
  loadGoals,
  addGoals,
  getActiveGoals,
  getCurrentSprintGoals,
  completeGoal,
  getSprintSummary,
  getUsersWithActiveGoals,
  type GoalStore,
} from "./goalStore";
import { initLLM, extractGoals, matchCompletions, generateResponse, isLLMReady } from "./llm";

// Bot configuration
const BOT_CONFIG = {
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
  TARGET_GROUP_ID: "", // This will be populated when the bot joins a group
};

// Create a new client instance
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: ".wwebjs_auth",
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-extensions",
      "--disable-plugins",
      "--disable-default-apps",
      "--disable-hang-monitor",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-default-browser-check",
      "--safebrowsing-disable-auto-update",
      "--disable-background-networking",
    ],
  },
});

// Scheduler state management
let schedulerActive = false;
const scheduledJobs: Record<string, any> = {};
let botStartTime: Date | null = null;

// Goal tracking state
let goalStore: GoalStore = {};
let lastKickoffMessageId: string | null = null;
const COMPLETION_KEYWORDS = ["done", "finished", "completed", "shipped", "launched", "deployed", "✅", "🎉"];

// Helper function to safely get chat for scheduled tasks
const safelyGetChat = async (chatId: string): Promise<GroupChat | null> => {
  try {
    // Check if client is ready
    if (!client.info || !client.info.wid) {
      console.error("Client is not ready for scheduled task");
      return null;
    }

    const chat = await client.getChatById(chatId);
    if (!chat || !chat.isGroup) {
      console.error("Target group chat not found or not a group");
      return null;
    }

    return chat as GroupChat;
  } catch (error) {
    console.error("Error getting chat for scheduled task:", error);
    return null;
  }
};

// Helper function to retry scheduled task with backoff
const retryScheduledTask = async (
  taskName: string,
  messageText: string,
  maxRetries: number = 3,
  baseDelay: number = 60000 // 1 minute
): Promise<Message | null> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${taskName}: Attempt ${attempt}/${maxRetries}`);

      const groupChat = await safelyGetChat(BOT_CONFIG.TARGET_GROUP_ID);
      if (!groupChat) {
        throw new Error("Unable to get target group chat");
      }

      const sentMessage = await groupChat.sendMessage(messageText);
      console.log(
        `${taskName}: Message sent successfully on attempt ${attempt}`
      );
      return sentMessage;
    } catch (error) {
      console.error(`${taskName}: Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        const delay = baseDelay * attempt; // Exponential backoff
        console.log(`${taskName}: Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`${taskName}: All ${maxRetries} attempts failed`);
  return null;
};

// Initialize bot status
const botStatus = {
  isActive: false,
  targetGroup: "",
  targetGroupName: "",
  scheduledTasksCount: 0,
  uptime: function () {
    if (!botStartTime) return "0 minutes";
    const diffMs = Date.now() - botStartTime.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffDays} days, ${diffHrs} hours, ${diffMins} minutes`;
  },
  nextScheduledTasks: [] as string[],
};

// Helper function to format dates for logging
const formatDate = (date: Date): string => {
  return date.toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "medium",
    timeStyle: "medium",
  });
};

// Function to check if a date is the last day of the month
const isLastDayOfMonth = (date: Date): boolean => {
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  return nextDay.getDate() === 1;
};

// Function to determine the week number within the month
const getWeekOfMonth = (date: Date): number => {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfWeek = firstDayOfMonth.getDay();
  return Math.ceil((date.getDate() + dayOfWeek) / 7);
};

// Function to get ISO week number (1-52)
const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Check if current week is a sprint week (odd ISO weeks)
const isSprintWeek = (date: Date): boolean => {
  return getISOWeekNumber(date) % 2 === 1;
};

// Function to create, schedule and manage timer tasks
const setupScheduledMessages = async (initialGroupChat: GroupChat) => {
  if (schedulerActive) {
    // Cancel any existing jobs if we're restarting
    Object.values(scheduledJobs).forEach((job) => job.cancel());
    Object.keys(scheduledJobs).forEach((key) => delete scheduledJobs[key]);
  }

  // Store the target group ID from the initial chat
  if (!BOT_CONFIG.TARGET_GROUP_ID) {
    BOT_CONFIG.TARGET_GROUP_ID = initialGroupChat.id._serialized;
    botStatus.targetGroup = initialGroupChat.id._serialized;
    botStatus.targetGroupName = initialGroupChat.name;
    console.log(
      `Set target group to: ${initialGroupChat.name} (${initialGroupChat.id._serialized})`
    );
  }

  try {
    // 1. Bi-weekly Monday 9am NZT - Sprint kickoff (odd ISO weeks)
    const mondayRule = new RecurrenceRule();
    mondayRule.dayOfWeek = 1; // Monday
    mondayRule.hour = 9;
    mondayRule.minute = 0;
    mondayRule.tz = "Pacific/Auckland";

    scheduledJobs.monday = scheduleJob("Monday 9am", mondayRule, async () => {
      try {
        const now = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" })
        );

        // Only execute on sprint weeks (odd ISO weeks)
        if (!isSprintWeek(now)) {
          console.log(`Skipping Monday task - not a sprint week (week ${getISOWeekNumber(now)})`);
          return;
        }

        console.log(`Executing Sprint Kickoff at ${formatDate(now)} (week ${getISOWeekNumber(now)})`);

        const kickoffMsg = await retryScheduledTask(
          "Sprint Kickoff",
          "*Sprint Kickoff* 🚀\n\n👉 What are your main goals for the next 2 weeks?\n\nShare below and let's crush this sprint together! 💪"
        );
        
        if (kickoffMsg) {
          lastKickoffMessageId = kickoffMsg.id._serialized;
          console.log(`Tracking kickoff message: ${lastKickoffMessageId}`);
        }

        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Sprint Kickoff task:", error);
      }
    });

    // 2. Bi-weekly Friday 3:30pm NZT - Sprint review (even ISO weeks)
    const fridayRule = new RecurrenceRule();
    fridayRule.dayOfWeek = 5; // Friday
    fridayRule.hour = 15;
    fridayRule.minute = 30;
    fridayRule.tz = "Pacific/Auckland";

    scheduledJobs.friday = scheduleJob(
      "Friday 3:30pm",
      fridayRule,
      async () => {
        try {
          const now = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" })
          );

          // Only execute on sprint review weeks (even ISO weeks)
          if (isSprintWeek(now)) {
            console.log(`Skipping Friday task - not a review week (week ${getISOWeekNumber(now)})`);
            return;
          }

          console.log(`Executing Sprint Review at ${formatDate(now)} (week ${getISOWeekNumber(now)})`);

          await retryScheduledTask(
            "Sprint Review",
            "*Sprint Review* 🔍\n\n👉 How did you do on your sprint goals?\n\nShare your wins, learnings, and let's celebrate our growth! 🎉"
          );

          updateNextScheduledTasks();
        } catch (error) {
          console.error("Error in Sprint Review task:", error);
        }
      }
    );

    // 3. First and third week of every month, on Wednesday at 9am NZT
    scheduledJobs.biweekly = scheduleJob("0 9 * * 3", async () => {
      try {
        const now = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" })
        );
        const weekOfMonth = getWeekOfMonth(now);

        // Only execute on the first and third weeks
        if (weekOfMonth === 1 || weekOfMonth === 3) {
          console.log(
            `Executing bi-weekly task at ${formatDate(
              now
            )} (Week ${weekOfMonth} of the month)`
          );

          await retryScheduledTask(
            "Bi-weekly demo",
            "*Demo day*\n\n👉 Share what you've been cooking up!\n\nThere is no specific format. Could be a short vid, link, screenshot or picture. 🏆"
          );
        }
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in bi-weekly task:", error);
      }
    });

    // 4. Mid-sprint check-in (Wednesday of week 2 at 9am NZT)
    const checkInRule = new RecurrenceRule();
    checkInRule.dayOfWeek = 3; // Wednesday
    checkInRule.hour = 9;
    checkInRule.minute = 0;
    checkInRule.tz = "Pacific/Auckland";

    scheduledJobs.checkIn = scheduleJob("Mid-sprint Check-in", checkInRule, async () => {
      try {
        const now = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" })
        );

        // Only execute on week 2 of sprint (even ISO weeks)
        if (isSprintWeek(now)) {
          console.log(`Skipping check-in - not mid-sprint (week ${getISOWeekNumber(now)})`);
          return;
        }

        console.log(`Executing Mid-sprint Check-in at ${formatDate(now)}`);

        // Get users with active goals and mention them
        const usersWithGoals = getUsersWithActiveGoals(goalStore);
        if (usersWithGoals.length === 0) {
          await retryScheduledTask(
            "Mid-sprint Check-in",
            "*Mid-Sprint Check-in* 📊\n\nHow's everyone tracking on their goals? Drop an update below! 👇"
          );
        } else {
          await retryScheduledTask(
            "Mid-sprint Check-in",
            "*Mid-Sprint Check-in* 📊\n\nWe're halfway through the sprint! How's everyone tracking?\n\n👉 Share a quick update on your progress 👇"
          );
        }

        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in Mid-sprint Check-in task:", error);
      }
    });

    // 5. Last day of every month at 9am NZT
    scheduledJobs.monthEnd = scheduleJob("0 9 * * *", async () => {
      try {
        const now = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" })
        );

        // Only execute on the last day of the month
        if (isLastDayOfMonth(now)) {
          console.log(`Executing month-end task at ${formatDate(now)}`);

          await retryScheduledTask(
            "Monthly celebration",
            "*Monthly Celebration* 🎊\n\nAs we close out the month, take a moment to reflect on your accomplishments!\n\nBe proud of what you've achieved ✨"
          );
        }
        updateNextScheduledTasks();
      } catch (error) {
        console.error("Error in month-end task:", error);
      }
    });

    schedulerActive = true;
    botStatus.isActive = true;
    botStatus.scheduledTasksCount = Object.keys(scheduledJobs).length;
    updateNextScheduledTasks();

    return true;
  } catch (error) {
    console.error("Error setting up scheduled messages:", error);
    return false;
  }
};

// Function to update the next scheduled tasks for diagnostics
const updateNextScheduledTasks = () => {
  botStatus.nextScheduledTasks = [];

  // Get the next invocation time for each job
  Object.entries(scheduledJobs).forEach(([name, job]) => {
    if (job && job.nextInvocation) {
      const nextTime = job.nextInvocation();
      if (nextTime) {
        botStatus.nextScheduledTasks.push(`${name}: ${formatDate(nextTime)}`);
      }
    }
  });

  // Sort by upcoming date
  botStatus.nextScheduledTasks.sort();
};

// Generate QR code for authentication
client.on("qr", (qr: string) => {
  qrcode.generate(qr, { small: true });
  console.log("QR code generated. Scan with WhatsApp mobile app.");
});

// Connection event handlers
client.on("loading_screen", (percent: number) => {
  console.log(`Loading: ${percent}%`);
});

client.on("authenticated", () => {
  console.log("Authentication successful!");
});

client.on("auth_failure", (msg: string) => {
  console.error("Authentication failed:", msg);
});

client.on("ready", async () => {
  console.log("Client is ready! KoruClub is now active.");
  isClientReady = true;
  botStartTime = new Date();
  
  // Initialize goal tracking
  goalStore = loadGoals();
  console.log(`Loaded ${Object.keys(goalStore).length} users with goals`);
  
  // Initialize LLM (non-blocking)
  initLLM().then((ready) => {
    if (ready) {
      console.log("Goal tracking with LLM is active");
    } else {
      console.warn("LLM not available - goal tracking will be limited");
    }
  });
});

client.on("disconnected", (reason: string) => {
  console.log("Client disconnected:", reason);
  schedulerActive = false;
  botStatus.isActive = false;
});

// Message handler
client.on("message", async (message: Message) => {
  try {
    const chat = await message.getChat();
    const content = message.body.trim();
    const isGroupMessage = message.from.endsWith("@g.us");
    const isDirectMessage = !isGroupMessage;
    
    // Log message reception with timestamp
    const timestamp = new Date().toISOString();
    if (isGroupMessage) {
      console.log(`[${timestamp}] Received group message from ${chat.name}`);
    } else {
      console.log(`[${timestamp}] Received direct message`);
    }

    if (isGroupMessage) {
      // Save this group as our target if not already set
      if (!BOT_CONFIG.TARGET_GROUP_ID) {
        BOT_CONFIG.TARGET_GROUP_ID = message.from;
        botStatus.targetGroup = message.from;
        botStatus.targetGroupName = chat.name;
        console.log(`Set target group to: ${chat.name} (${message.from})`);
      }

      // Handle group commands
      if (content === BOT_CONFIG.START_COMMAND) {
        if (schedulerActive) {
          await chat.sendMessage(
            "🤖 I'm already running! The scheduled message service is active."
          );
        } else {
          const success = await setupScheduledMessages(chat as GroupChat);
          if (success) {
            await chat.sendMessage(
              "📆 Scheduled message service started! I will now post regular updates according to the schedule."
            );
          } else {
            await chat.sendMessage(
              "❌ Failed to start scheduled message service. Please check server logs."
            );
          }
        }
      } else if (content === BOT_CONFIG.STOP_COMMAND) {
        if (!schedulerActive) {
          await chat.sendMessage(
            "🤖 I'm not currently running any scheduled messages."
          );
        } else {
          // Cancel all scheduled jobs
          Object.values(scheduledJobs).forEach((job) => job.cancel());
          Object.keys(scheduledJobs).forEach((key) => delete scheduledJobs[key]);
          
          schedulerActive = false;
          botStatus.isActive = false;
          botStatus.scheduledTasksCount = 0;
          botStatus.nextScheduledTasks = [];
          
          await chat.sendMessage(
            "🛑 Scheduled message service stopped. All scheduled messages have been cancelled."
          );
          console.log("[" + new Date().toISOString() + "] Scheduled message service stopped by user command");
        }
      } else if (content === BOT_CONFIG.STATUS_COMMAND) {
        // Send diagnostic information
        const status =
          `*Bot Status Report*\n\n` +
          `🤖 Active: ${botStatus.isActive ? "Yes ✅" : "No ❌"}\n` +
          `⏱️ Uptime: ${botStatus.uptime()}\n` +
          `👥 Target Group: ${botStatus.targetGroupName}\n` +
          `📊 Scheduled Tasks: ${botStatus.scheduledTasksCount}\n\n` +
          `*Upcoming Messages:*\n${
            botStatus.nextScheduledTasks.length
              ? botStatus.nextScheduledTasks
                  .map((task) => `- ${task}`)
                  .join("\n")
              : "No upcoming messages scheduled."
          }`;

        await chat.sendMessage(status);
      } else if (content === BOT_CONFIG.HELP_COMMAND) {
        // Display available commands
        const helpText =
          `*Available Commands*\n\n` +
          `📝 *${BOT_CONFIG.START_COMMAND}*\n` +
          `Starts the scheduled messaging service.\n\n` +
          `📊 *${BOT_CONFIG.STATUS_COMMAND}*\n` +
          `Shows the current bot status and upcoming scheduled messages.\n\n` +
          `🛟 *${BOT_CONFIG.HELP_COMMAND}*\n` +
          `Displays this help message.\n\n` +
          `🛑 *${BOT_CONFIG.STOP_COMMAND}*\n` +
          `Stops the scheduled messaging service.\n\n` +
          `📅 *${BOT_CONFIG.MONDAY_COMMAND}*\n` +
          `Triggers the Sprint Kickoff message manually.\n\n` +
          `📅 *${BOT_CONFIG.FRIDAY_COMMAND}*\n` +
          `Triggers the Sprint Review message manually.\n\n` +
          `📅 *${BOT_CONFIG.DEMO_COMMAND}*\n` +
          `Triggers the biweekly demo day message manually.\n\n` +
          `📅 *${BOT_CONFIG.MONTHLY_COMMAND}*\n` +
          `Triggers the monthly celebration message manually.\n\n` +
          `📋 *${BOT_CONFIG.GOALS_COMMAND}*\n` +
          `Shows your current active goals.\n\n` +
          `*Note:* You can also DM me *${BOT_CONFIG.STATUS_COMMAND}* for a private status update.`;

        await chat.sendMessage(helpText);
      } else if (content === BOT_CONFIG.MONDAY_COMMAND) {
        // Manually trigger sprint kickoff message
        console.log(
          `Manually triggering Sprint Kickoff at ${formatDate(new Date())}`
        );
        await chat.sendMessage(
          "*Sprint Kickoff* 🚀\n\n👉 What are your main goals for the next 2 weeks?\n\nShare below and let's crush this sprint together! 💪"
        );
      } else if (content === BOT_CONFIG.FRIDAY_COMMAND) {
        // Manually trigger sprint review message
        console.log(
          `Manually triggering Sprint Review at ${formatDate(new Date())}`
        );
        await chat.sendMessage(
          "*Sprint Review* 🔍\n\n👉 How did you do on your sprint goals?\n\nShare your wins, learnings, and let's celebrate our growth! 🎉"
        );
      } else if (content === BOT_CONFIG.DEMO_COMMAND) {
        // Manually trigger biweekly demo day message
        console.log(
          `Manually triggering biweekly demo day message at ${formatDate(
            new Date()
          )}`
        );
        await chat.sendMessage(
          "*Demo day*\n\n👉 Share what you've been cooking up!\n\nThere is no specific format. Could be a short vid, link, screenshot or picture. 🏆"
        );
      } else if (content === BOT_CONFIG.MONTHLY_COMMAND) {
        // Manually trigger monthly celebration message
        console.log(
          `Manually triggering monthly celebration message at ${formatDate(
            new Date()
          )}`
        );
        await chat.sendMessage(
          "*Monthly Celebration* 🎊\n\nAs we close out the month, take a moment to reflect on your accomplishments!\n\nBe proud of what you've achieved ✨"
        );
      } else if (content === BOT_CONFIG.GOALS_COMMAND) {
        // Show user's current goals
        const userId = message.author || message.from;
        const activeGoals = getActiveGoals(goalStore, userId);
        
        if (activeGoals.length === 0) {
          await chat.sendMessage(
            "📋 You don't have any active goals yet.\n\nReply to a Sprint Kickoff message to set your goals!"
          );
        } else {
          const goalsList = activeGoals
            .map((g, i) => `${i + 1}. ${g.text}`)
            .join("\n");
          await chat.sendMessage(
            `*Your Active Goals* 📋\n\n${goalsList}\n\n_Mark as done by posting an update with "done", "finished", or "completed"_`
          );
        }
      } else if (!content.startsWith(BOT_CONFIG.COMMAND_PREFIX)) {
        // Non-command message - check for goal-related content
        const userId = message.author || message.from;
        
        // Check if this is a reply to a kickoff message (goal setting)
        const quotedMsg = await message.getQuotedMessage().catch(() => null);
        const isReplyToKickoff = quotedMsg && 
          (quotedMsg.id._serialized === lastKickoffMessageId ||
           quotedMsg.body.includes("Sprint Kickoff") ||
           quotedMsg.body.includes("What are your main goals"));
        
        if (isReplyToKickoff && isLLMReady()) {
          // Extract goals from the message
          console.log(`[Goal Extraction] Processing goals from ${userId}`);
          const extractedGoals = await extractGoals(content);
          
          if (extractedGoals.length > 0) {
            const newGoals = addGoals(goalStore, userId, extractedGoals);
            console.log(`[Goal Extraction] Captured ${newGoals.length} goals for ${userId}`);
            
            // Acknowledge the goals
            const response = await generateResponse("goal_captured", { goals: extractedGoals });
            const goalsList = extractedGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");
            
            await message.reply(
              response || `✅ Got it! I've captured your goals:\n\n${goalsList}\n\n_I'll track these for you this sprint!_`
            );
          }
        }
        
        // Check for completion keywords
        const hasCompletionKeyword = COMPLETION_KEYWORDS.some((kw) => 
          content.toLowerCase().includes(kw.toLowerCase())
        );
        
        if (hasCompletionKeyword && isLLMReady()) {
          const activeGoals = getActiveGoals(goalStore, userId);
          
          if (activeGoals.length > 0) {
            console.log(`[Completion Check] Checking message from ${userId} against ${activeGoals.length} goals`);
            const matches = await matchCompletions(content, activeGoals);
            
            const completedGoals: string[] = [];
            for (const match of matches) {
              if (match.confidence === "high" || match.confidence === "medium") {
                const goal = completeGoal(goalStore, userId, match.goalId);
                if (goal) {
                  completedGoals.push(goal.text);
                  console.log(`[Completion] Marked goal as done: ${goal.text}`);
                }
              }
            }
            
            if (completedGoals.length > 0) {
              const response = await generateResponse("goal_completed", { completedGoals });
              await message.react("🎉");
              if (response && completedGoals.length > 1) {
                await message.reply(response);
              }
            }
          }
        }
      }
    } else if (isDirectMessage) {
      // Handle direct message commands (admin only)
      if (content === BOT_CONFIG.STATUS_COMMAND) {
        const status =
          `*Bot Status Report*\n\n` +
          `🤖 Active: ${botStatus.isActive ? "Yes ✅" : "No ❌"}\n` +
          `⏱️ Uptime: ${botStatus.uptime()}\n` +
          `👥 Target Group: ${botStatus.targetGroupName || "Not set"}\n` +
          `📊 Scheduled Tasks: ${botStatus.scheduledTasksCount}\n\n` +
          `*Upcoming Messages:*\n${botStatus.nextScheduledTasks.length
            ? botStatus.nextScheduledTasks
                .map((task) => `- ${task}`)
                .join("\n")
            : "No upcoming messages scheduled."
          }`;

        await chat.sendMessage(status);
        console.log(`[${new Date().toISOString()}] Sent status report via direct message`);
      } else if (content === BOT_CONFIG.HELP_COMMAND) {
        const helpText =
          `*Admin Commands (Direct Message)*\n\n` +
          `📊 *${BOT_CONFIG.STATUS_COMMAND}*\n` +
          `Shows the current bot status and upcoming scheduled messages.\n\n` +
          `🛟 *${BOT_CONFIG.HELP_COMMAND}*\n` +
          `Displays this help message.\n\n` +
          `*Note:* Start/stop commands must be used in the target group chat.`;

        await chat.sendMessage(helpText);
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
});

// Error handling
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Initialize the client
console.log("Starting KoruClub...");
client.initialize();
