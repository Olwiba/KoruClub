// WhatsApp client setup and configuration
import fs from "fs";
import { isProduction } from "./config";
import { PrismaStore } from "./store";

// @ts-ignore - RemoteAuth exists at runtime but TypeScript types are incomplete
const { Client, LocalAuth, RemoteAuth } = require("whatsapp-web.js");

// Patch RemoteAuth to clean lockfiles after session extraction
if (isProduction) {
  try {
    const RemoteAuthPath = require.resolve("whatsapp-web.js/src/authStrategies/RemoteAuth");
    const RemoteAuthModule = require(RemoteAuthPath);
    const unzipper = require("unzipper");

    RemoteAuthModule.prototype.unCompressSession = async function (compressedSessionPath: string) {
      const stream = fs.createReadStream(compressedSessionPath);
      await new Promise((resolve, reject) => {
        stream
          .pipe(unzipper.Extract({ path: this.userDataDir }))
          .on("error", (err: Error) => reject(err))
          .on("finish", () => resolve(true));
      });
      await fs.promises.unlink(compressedSessionPath);

      // Clean lockfiles that cause "browser already running" errors
      const lockFiles = ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"];
      for (const lock of lockFiles) {
        const lockPath = `${this.userDataDir}/${lock}`;
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      }
      console.log("[RemoteAuth] Session restored");
    };
    console.log("RemoteAuth patch applied (lockfile cleanup)");
  } catch (err) {
    console.error("Failed to patch RemoteAuth:", err);
  }
}

// Configure auth strategy based on environment
const store = isProduction ? new PrismaStore() : null;

const authStrategy = isProduction
  ? new RemoteAuth({
      store,
      backupSyncIntervalMs: 60000, // 1 minute
      clientId: "koruclub",
      dataPath: "./.wwebjs_auth",
    })
  : new LocalAuth({ dataPath: ".wwebjs_auth" });

console.log(`Using ${isProduction ? "RemoteAuth (PostgreSQL)" : "LocalAuth (local files)"}`);

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

// Clean stale lockfiles from previous runs
export const cleanStaleLockfiles = () => {
  const sessionDir = "./.wwebjs_auth/RemoteAuth-koruclub";
  const lockFiles = ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"];
  for (const lock of lockFiles) {
    const lockPath = `${sessionDir}/${lock}`;
    if (fs.existsSync(lockPath)) {
      console.log(`Removing stale ${lock}...`);
      try {
        fs.unlinkSync(lockPath);
      } catch (e) {
        console.warn(`Could not remove ${lock}:`, e);
      }
    }
  }
};
