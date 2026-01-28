#!/bin/sh

# Clean up stale Chrome singleton locks that prevent startup after crashes
rm -f /app/.wwebjs_cache/*/SingletonLock 2>/dev/null || true
rm -f /app/.wwebjs_cache/*/SingletonSocket 2>/dev/null || true
rm -f /app/.wwebjs_cache/*/SingletonCookie 2>/dev/null || true

echo "Cleaned up stale Chrome locks"

# Start the bot
exec bun run start
