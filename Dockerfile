# ── Express Backend ───────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend server
COPY server.cjs ./

# Create output directory for saved images
RUN mkdir -p /app/output

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.cjs"]
