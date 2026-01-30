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
        openssl \
        --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN bun install --frozen-lockfile --production

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN bun run db:generate

# Copy app source
COPY . .

# Add non-root user for Puppeteer
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && mkdir -p /app/.wwebjs_auth \
    && chown -R pptruser:pptruser /home/pptruser /app

USER pptruser

# Environment
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["sh", "-c", "bun run db:push && bun run start"]
