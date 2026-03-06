# ── Build stage ──────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace config, lockfile, and full types source.
# types/ must be present before npm ci because its prepare script
# runs tsc to build the package.
COPY package.json package-lock.json ./
COPY types/ types/
COPY pdf/package.json pdf/

RUN npm ci --workspace=types --workspace=pdf

# Copy pdf source code (types already copied above)
COPY pdf/ pdf/

# Build pdf (types was already built by prepare during npm ci)
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

# Install production dependencies only.
# .npmrc disables lifecycle scripts because types source and tsc
# are not available in this stage — only pre-built dist is copied.
RUN echo "ignore-scripts=true" > .npmrc \
    && npm ci --workspace=types --workspace=pdf --omit=dev \
    && rm .npmrc

# Copy compiled output from builder
COPY --from=builder /app/types/dist types/dist
COPY --from=builder /app/pdf/dist pdf/dist

RUN chown -R pdf:pdf /app

USER pdf

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "pdf/dist/server.js"]
