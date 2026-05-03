# ── Stage 1: Build frontend ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (Docker layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .

# Set the API base to empty string so the frontend calls the same origin
# (Express will serve both the API and the static frontend)
ENV VITE_API_BASE=""
RUN npm run build

# ── Stage 2: Production image ───────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend server
COPY server.cjs ./

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Create output directory for saved images
RUN mkdir -p /app/output

# Expose the backend port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server.cjs"]
