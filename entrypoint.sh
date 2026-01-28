#!/bin/sh

# Clean up stale Chrome singleton locks that prevent startup after crashes
# Search recursively in all possible locations
find /app/.wwebjs_cache -name "Singleton*" -type f -delete 2>/dev/null || true
find /app/.wwebjs_auth -name "Singleton*" -type f -delete 2>/dev/null || true

# Also clean up any lock files in Default profile
rm -rf /app/.wwebjs_cache/*/Default/Singleton* 2>/dev/null || true
rm -rf /app/.wwebjs_cache/*/*/Singleton* 2>/dev/null || true

echo "Cleaned up stale Chrome locks"

# Start the bot
exec bun run start
