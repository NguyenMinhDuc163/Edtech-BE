
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci --prefer-offline --no-audit --maxsockets 1

COPY . .

RUN npm run build && \
    npm cache clean --force

FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./


RUN npm ci --only=production --prefer-offline --no-audit --maxsockets 1 && \
    npm cache clean --force


COPY --from=builder /app/dist ./dist


RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["node", "dist/main.js"]