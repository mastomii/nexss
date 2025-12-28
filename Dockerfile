# ==============================================
# NeXSS - Multi-Stage Dockerfile
# ==============================================

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies needed for native modules (bcrypt)
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for build)
RUN npm ci --legacy-peer-deps

# ==============================================
# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production environment for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# ==============================================
# Stage 3: Production Runner (Ultra Minimal)
FROM node:22-alpine AS runner
WORKDIR /app

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy only necessary files from builder
# 1. Public assets
COPY --from=builder /app/public ./public

# 2. Standalone server (includes node_modules needed for runtime)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 3. Static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for screenshots
RUN mkdir -p /app/data/screenshots && chown -R nextjs:nodejs /app/data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check - use dedicated health endpoint with IPv4
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --tries=1 http://127.0.0.1:3000/api/setup/health -O - > /dev/null 2>&1 || exit 1

# Start the server
CMD ["node", "server.js"]
