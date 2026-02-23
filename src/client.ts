// WhatsApp client setup and configuration
import fs from "fs";

const { Client, LocalAuth } = require("whatsapp-web.js");

const authStrategy = new LocalAuth({ dataPath: ".wwebjs_auth" });
console.log("Using LocalAuth (persistent local files)");

// Log whatsapp-web.js version for debugging
try {
  const wwjsPackage = require("whatsapp-web.js/package.json");
  console.log(`whatsapp-web.js version: ${wwjsPackage.version}`);
} catch (e) {
  console.log("Could not determine whatsapp-web.js version");
}

// Create and export WhatsApp client
export const client = new Client({
  authStrategy,
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      ...(process.platform === "win32" ? [] : ["--single-process"]),
      "--disable-gpu",
    ],
  },
});

// Helper to safely get a chat with retry
export const safelyGetChat = async (chatId: string) => {
  try {
    if (!client.info || !client.info.wid) {
      console.error("Client is not ready for scheduled task");
      return null;
    }
    const chat = await client.getChatById(chatId);
    if (!chat || !chat.isGroup) {
      console.error("Target group chat not found or not a group");
      return null;
    }
    return chat;
  } catch (error) {
    console.error("Error getting chat for scheduled task:", error);
    return null;
  }
};

// Retry sending a scheduled message
export const retryScheduledTask = async (
  taskName: string,
  messageText: string,
  targetGroupId: string,
  maxRetries: number = 3,
  baseDelay: number = 60000
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${taskName}: Attempt ${attempt}/${maxRetries}`);
      const groupChat = await safelyGetChat(targetGroupId);
      if (!groupChat) throw new Error("Unable to get target group chat");
      const sentMessage = await groupChat.sendMessage(messageText, { sendSeen: false });
      console.log(`${taskName}: Message sent successfully on attempt ${attempt}`);
      return sentMessage;
    } catch (error) {
      console.error(`${taskName}: Attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        const delay = baseDelay * attempt;
        console.log(`${taskName}: Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`${taskName}: All ${maxRetries} attempts failed`);
  return null;
};

// Get the client instance
export const getClient = () => client;

// Clean stale lockfiles from previous runs
export const cleanStaleLockfiles = () => {
  const lockFiles = ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"];
  const root = "./.wwebjs_auth";

  if (!fs.existsSync(root)) {
    return;
  }

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (lockFiles.includes(entry.name)) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`Removed stale lockfile: ${fullPath}`);
        } catch (e) {
          console.warn(`Could not remove ${fullPath}:`, e);
        }
      }
    }
  };

  walk(root);
};
