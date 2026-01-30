#!/bin/sh

# Clean up stale Chrome singleton locks that prevent startup after crashes
echo "Cleaning Chrome locks..."

# Remove ALL singleton lock files recursively
find /app -name "Singleton*" -type f -delete 2>/dev/null || true
find /app -name "lockfile" -type f -delete 2>/dev/null || true

# Also check home directory (puppeteer sometimes uses this)
find /home/pptruser -name "Singleton*" -type f -delete 2>/dev/null || true

# Nuclear option: remove Chrome's lock directory contents
rm -rf /app/.wwebjs_auth/session/Default/Singleton* 2>/dev/null || true
rm -rf /app/.wwebjs_auth/session-*/Default/Singleton* 2>/dev/null || true
rm -rf /app/.wwebjs_cache/*/Default/Singleton* 2>/dev/null || true

echo "Cleaned up stale Chrome locks"

# Start the bot
exec bun run start
