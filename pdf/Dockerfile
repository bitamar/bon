# ── Build stage ──────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace config, lockfile, and full types source.
# types/ must be present before npm ci because the root prepare
# script builds @bon/types during install.
COPY package.json package-lock.json ./
COPY types/ types/
COPY pdf/package.json pdf/

RUN npm ci --workspace=types --workspace=pdf

# Copy pdf source and build (types already built by prepare)
COPY pdf/ pdf/

RUN npm run build --workspace=pdf

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

# Install production dependencies only (prepare skips because types/src
# doesn't exist in this stage — only pre-built dist is copied below)
RUN npm ci --workspace=types --workspace=pdf --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/types/dist types/dist
COPY --from=builder /app/pdf/dist pdf/dist

RUN chown -R pdf:pdf /app

USER pdf

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "pdf/dist/server.js"]
