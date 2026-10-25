FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit && npm run build -w @steward/commerce-kit && npm run build -w @steward/simulation-kit
COPY modules/simulation-fulfillment ./modules/simulation-fulfillment
RUN cd modules/simulation-fulfillment && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/simulation-fulfillment
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/packages/commerce-kit /app/packages/commerce-kit
COPY --from=build /app/packages/simulation-kit /app/packages/simulation-kit
COPY --from=build /app/modules/simulation-fulfillment/node_modules ./node_modules
COPY --from=build /app/modules/simulation-fulfillment/dist ./dist
COPY modules/simulation-fulfillment/package.json modules/simulation-fulfillment/manifest.json ./
COPY modules/simulation-fulfillment/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="steward.simulation.fulfillment" steward.module.version="1.0.1" steward.module.sdk="1"
CMD ["node","dist/index.js"]
