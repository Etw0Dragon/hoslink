FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Coolify may inject NODE_ENV=production as a build argument.
# The compiler and browser bundler are still required in this stage.
RUN npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node web/static ./web/static
COPY --from=build --chown=node:node /app/web/static/auth.js ./web/static/auth.js
COPY --chown=node:node public/logo.png ./public/logo.png
RUN mkdir -p var/mail && chown -R node:node var
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
