FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Production server
FROM node:20-alpine

WORKDIR /app

# Create app directory
RUN mkdir -p public data logs

# Install production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js .
COPY --from=builder /app/package.json .
COPY --from=builder /app/public ./public
COPY --from=builder /app/modules ./modules
COPY --from=builder /app/chat.js .

# Create non-root user
RUN addgroup -S neochat && adduser -S neochat -G neochat
USER neochat

# Expose ports
EXPOSE 3000
EXPOSE 3001
EXPOSE 3002
EXPOSE 4444
EXPOSE 5555

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const net = require('net'); const s = net.connect(3000, 'localhost', () => { s.end(); process.exit(0); }); s.on('error', () => process.exit(1));"

# Start server
CMD ["node", "server.js"]
