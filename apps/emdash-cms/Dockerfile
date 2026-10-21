FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV ASTRO_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/uploads && chown -R node:node /data
WORKDIR /data
USER node
EXPOSE 4321
VOLUME ["/data"]
CMD ["node", "/app/dist/server/entry.mjs"]
