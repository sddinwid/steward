FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit && npm run build -w @steward/carrier-kit
COPY modules/carrier-simulator ./modules/carrier-simulator
RUN cd modules/carrier-simulator && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/carrier-simulator
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/packages/carrier-kit /app/packages/carrier-kit
COPY --from=build /app/modules/carrier-simulator/node_modules ./node_modules
COPY --from=build /app/modules/carrier-simulator/dist ./dist
COPY modules/carrier-simulator/package.json modules/carrier-simulator/manifest.json ./
COPY modules/carrier-simulator/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="steward.carrier.simulator" steward.module.version="1.0.2" steward.module.sdk="1"
CMD ["node","dist/index.js"]
