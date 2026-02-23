// KoruClub WhatsApp Bot - Main Entry Point
const qrcode = require("qrcode-terminal");

import { startHealthServer, setClientReady } from "./health";
import { client, cleanStaleLockfiles } from "./client";
import { setBotStartTime, setSchedulerActive, botStatus } from "./state";
import { handleMessage } from "./handlers";

// Guard against duplicate ready events
let hasInitialized = false;

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
  if (hasInitialized) {
    console.log("Client ready (duplicate event ignored)");
    return;
  }
  hasInitialized = true;
  console.log("Client ready");
  setClientReady(true);
  setBotStartTime(new Date());

  // Send admin notification if configured - with retry
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId) {
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
          setTimeout(() => sendAdminNotification(attempt + 1), 10000);
        }
      }
    };
    // Wait 30s for WhatsApp to fully stabilize before first attempt
    setTimeout(() => sendAdminNotification(), 30000);
  } else {
    console.log("[Admin] No ADMIN_CHAT_ID configured, skipping notification");
  }

});

client.on("disconnected", (reason: string) => {
  console.log("Client disconnected:", reason);
  hasInitialized = false; // Allow re-initialization on reconnect
  setClientReady(false);
  setSchedulerActive(false);
  botStatus.isActive = false;
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
