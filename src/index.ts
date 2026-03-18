// KoruClub WhatsApp Bot - Main Entry Point
const qrcode = require("qrcode-terminal");

import { startHealthServer, setClientReady } from "./health";
import { client, cleanStaleLockfiles } from "./client";
import { setBotStartTime } from "./state";
import { handleMessage } from "./handlers";
import { setupScheduledMessages, stopScheduler } from "./scheduler";
import { autoStartScheduler, targetGroupId } from "./config";

const tryAutoStartScheduler = async () => {
  if (!autoStartScheduler) {
    console.log("[Scheduler] Auto-start disabled (AUTO_START_SCHEDULER=false)");
    return;
  }

  if (!targetGroupId) {
    console.log("[Scheduler] Auto-start skipped: TARGET_GROUP_ID is not set");
    return;
  }

  try {
    const targetChat = await client.getChatById(targetGroupId);
    if (!targetChat.isGroup) {
      console.error(`[Scheduler] Auto-start failed: TARGET_GROUP_ID is not a group (${targetGroupId})`);
      return;
    }

    const started = await setupScheduledMessages(targetChat);
    if (started) {
      console.log(`[Scheduler] Auto-started for group ${targetGroupId}`);
    } else {
      console.error("[Scheduler] Auto-start failed during setup");
    }
  } catch (error) {
    console.error(`[Scheduler] Auto-start failed for TARGET_GROUP_ID=${targetGroupId}:`, error);
  }
};

// Keep duplicate ready events harmless without permanently skipping reconnect setup.
let hasAnnouncedReady = false;
let readySetupInProgress = false;
let adminNotificationTimer: ReturnType<typeof setTimeout> | null = null;

// Global error handlers to catch crashes
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION at:", promise, "reason:", reason);
});

// Start health check server
startHealthServer(3000);

// ============================================
// WhatsApp Client Event Handlers
// ============================================

client.on("qr", (qr: string) => {
  console.log("Scan QR code with WhatsApp mobile app:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("Authenticated");
});

client.on("auth_failure", (msg: string) => {
  console.error("Authentication failed:", msg);
});

client.on("ready", async () => {
  console.log(hasAnnouncedReady ? "Client ready (duplicate event)" : "Client ready");
  setClientReady(true);
  if (!hasAnnouncedReady) {
    setBotStartTime(new Date());
    hasAnnouncedReady = true;
  }

  // Send admin notification if configured - with retry
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId && !adminNotificationTimer) {
    console.log(`[Admin] Chat ID configured: ${adminChatId}`);
    const sendAdminNotification = async (attempt = 1) => {
      try {
        // Check if chat ID is registered on WhatsApp
        const numberId = await client.getNumberId(adminChatId.replace("@c.us", ""));
        if (!numberId) {
          console.error(`[Admin] Number ${adminChatId} is not registered on WhatsApp`);
          return;
        }
        console.log(`[Admin] Number verified: ${numberId._serialized}`);

        const result = await client.sendMessage(adminChatId, "✅ *Bot Online*\n\nKoruClub is now connected and ready.");
        console.log(`[Admin] Notification sent, message ID: ${result?.id?._serialized || "unknown"}`);
      } catch (err) {
        console.error(`[Admin] Failed to send notification (attempt ${attempt}):`, err);
        if (attempt < 3) {
          console.log(`[Admin] Retrying in 10s...`);
          adminNotificationTimer = setTimeout(() => sendAdminNotification(attempt + 1), 10000);
        }
      }
    };
    // Wait 30s for WhatsApp to fully stabilize before first attempt
    adminNotificationTimer = setTimeout(() => sendAdminNotification(), 30000);
  } else if (!adminChatId) {
    console.log("[Admin] No ADMIN_CHAT_ID configured, skipping notification");
  }

  if (readySetupInProgress) {
    console.log("[Scheduler] Ready setup already in progress");
    return;
  }

  readySetupInProgress = true;
  try {
    await tryAutoStartScheduler();
  } finally {
    readySetupInProgress = false;
  }
});

client.on("disconnected", (reason: string) => {
  console.log("Client disconnected:", reason);
  hasAnnouncedReady = false;
  readySetupInProgress = false;
  if (adminNotificationTimer) {
    clearTimeout(adminNotificationTimer);
    adminNotificationTimer = null;
  }
  setClientReady(false);
  stopScheduler();
});

client.on("message_create", handleMessage);

// ============================================
// Main Startup
// ============================================

async function main() {
  console.log("Starting KoruClub...");

  // Clean up stale lockfiles from previous runs
  cleanStaleLockfiles();

  // Initialize WhatsApp client
  client.initialize().catch((err: Error) => {
    console.error("Client initialization failed:", err);
  });
}

main().catch((err) => {
  console.error("Main function failed:", err);
});
