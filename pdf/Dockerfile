# ── Build stage ──────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace config, lockfile, and types source (needed if prepare runs)
COPY package.json package-lock.json ./
COPY types/ types/
COPY pdf/package.json pdf/

RUN npm ci --workspace=types --workspace=pdf --ignore-scripts

# Copy pdf source code
COPY pdf/ pdf/

# Build types first (shared dependency), then pdf
RUN npm run build --workspace=types && npm run build --workspace=pdf

# ── Production stage ─────────────────────────────────────────────
FROM node:22-slim

# Install Chromium and fonts for Hebrew PDF rendering, create non-root user
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       chromium \
       fonts-liberation \
       fonts-noto \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r pdf && useradd -r -g pdf -G audio,video pdf \
    && mkdir -p /home/pdf && chown -R pdf:pdf /home/pdf

WORKDIR /app

# Copy workspace config and package files
COPY package.json package-lock.json ./
COPY types/package.json types/
COPY pdf/package.json pdf/

# Install production dependencies only (ignore-scripts: no source available)
RUN npm ci --workspace=types --workspace=pdf --omit=dev --ignore-scripts

# Copy compiled output from builder
COPY --from=builder /app/types/dist types/dist
COPY --from=builder /app/pdf/dist pdf/dist

RUN chown -R pdf:pdf /app

USER pdf

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "pdf/dist/server.js"]
