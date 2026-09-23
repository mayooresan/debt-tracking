# Stage 1: Build client and server
FROM node:20-alpine AS builder

# Install build dependencies for native modules (e.g. better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# If client package.json exists, install client dependencies
RUN if [ -f "client/package.json" ]; then npm --prefix client ci || npm --prefix client install; fi

# Build server and client
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

# Install dependencies for native modules if compilation is required
RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
