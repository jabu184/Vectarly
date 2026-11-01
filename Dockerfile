# ==========================================
# Stage 1: Build Frontend (Vite / React)
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /build/client

# Install client dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client source and compile static assets
COPY client/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Server (Node + Express)
# ==========================================
FROM node:20-slim AS runner
WORKDIR /app

# Install native build tools (python3, make, g++) for any compiled dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Persistent data directory
RUN mkdir -p /app/data && chmod 777 /app/data
VOLUME ["/app/data"]

# Install server dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --include=dev

# Copy server code and build TypeScript
COPY server/ ./
RUN npm run build && npm prune --production

# Copy compiled frontend dist from Stage 1 into /app/client/dist
COPY --from=frontend-builder /build/client/dist /app/client/dist

WORKDIR /app
EXPOSE 3000

# Start unified production server
CMD ["node", "server/dist/index.js"]
