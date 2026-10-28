# API and worker image (same image, different command).
# Not yet built or run in this repository's environment; verify on the server.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S mms && adduser -S mms -G mms && mkdir -p /app/storage && chown mms:mms /app/storage
COPY --from=build --chown=mms:mms /app/node_modules ./node_modules
COPY --from=build --chown=mms:mms /app/dist ./dist
COPY --from=build --chown=mms:mms /app/prisma ./prisma
COPY --from=build --chown=mms:mms /app/prisma.config.ts /app/package.json ./
USER mms
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live || exit 1
CMD ["node", "dist/server.js"]
