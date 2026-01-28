FROM oven/bun:1 AS base

# Install Chromium and dependencies
RUN apt-get update \
    && apt-get install -y \
        chromium \
        fonts-ipafont-gothic \
        fonts-wqy-zenhei \
        fonts-thai-tlwg \
        fonts-freefont-ttf \
        ca-certificates \
        curl \
        --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install app dependencies
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN bun install --frozen-lockfile --production

# Add user so we don't need --no-sandbox
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && mkdir -p /home/pptruser/.chrome-user-data \
    && chown -R pptruser:pptruser /home/pptruser

# Create directories for persistent data (volumes mount here)
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/data \
    && chown -R pptruser:pptruser /app/.wwebjs_auth /app/.wwebjs_cache /app/data

# Copy app source
COPY . .

# Make entrypoint executable and fix ownership
RUN chmod +x /app/entrypoint.sh && chown -R pptruser:pptruser /app

# Run everything after as non-privileged user
USER pptruser

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
