FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit && npm run build -w @steward/contracts && npm run build -w @steward/mission-kit && npm run build -w @steward/economy-kit
COPY modules/resource-coordination ./modules/resource-coordination
RUN cd modules/resource-coordination && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/resource-coordination
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/packages/contracts /app/packages/contracts
COPY --from=build /app/packages/mission-kit /app/packages/mission-kit
COPY --from=build /app/packages/economy-kit /app/packages/economy-kit
COPY --from=build /app/modules/resource-coordination/node_modules ./node_modules
COPY --from=build /app/modules/resource-coordination/dist ./dist
COPY modules/resource-coordination/package.json modules/resource-coordination/manifest.json ./
COPY modules/resource-coordination/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="steward.finance.resource-coordination" steward.module.version="1.0.0" steward.module.sdk="1"
CMD ["node","dist/index.js"]
