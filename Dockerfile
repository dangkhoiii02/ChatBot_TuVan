# Node.js LTS minimal container
FROM node:22-alpine

WORKDIR /app

# Copy package descriptors
COPY package.json package-lock.json ./

# Install production dependencies (if any)
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source files
COPY src/ ./src/
COPY bin/ ./bin/
COPY public/ ./public/

# Ensure storage directory for persistent SQLite volume
RUN mkdir -p storage backups

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/storage/app.db

EXPOSE 3000

CMD ["node", "src/index.js"]
