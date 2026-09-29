FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system visipro && useradd --system --gid visipro --home /app visipro
COPY --from=build --chown=visipro:visipro /app/node_modules ./node_modules
COPY --from=build --chown=visipro:visipro /app/dist ./dist
COPY --chown=visipro:visipro package.json ./
COPY --chown=visipro:visipro migrations ./migrations
USER visipro
EXPOSE 8080
CMD ["node", "dist/server.js"]
