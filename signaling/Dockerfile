# AEROKIN WebRTC Signaling Service Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace configurations for pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY signaling/package.json ./signaling/

# Enable corepack and install dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm --filter aerokin-signaling install --frozen-lockfile

# Copy signaling source and build
COPY signaling/tsconfig.json ./signaling/
COPY signaling/src ./signaling/src
RUN pnpm --filter aerokin-signaling build

# Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8088
ENV HOST=0.0.0.0

# Install production dependencies only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY signaling/package.json ./signaling/
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm --filter aerokin-signaling install --prod --frozen-lockfile

# Copy compiled JavaScript from builder
COPY --from=builder /app/signaling/dist ./signaling/dist

EXPOSE 8088

CMD ["node", "signaling/dist/index.js"]
