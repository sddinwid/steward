FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit && npm run build -w @steward/commerce-kit && npm run build -w @steward/simulation-kit
COPY modules/simulation-commerce ./modules/simulation-commerce
RUN cd modules/simulation-commerce && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/simulation-commerce
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/packages/commerce-kit /app/packages/commerce-kit
COPY --from=build /app/packages/simulation-kit /app/packages/simulation-kit
COPY --from=build /app/modules/simulation-commerce/node_modules ./node_modules
COPY --from=build /app/modules/simulation-commerce/dist ./dist
COPY modules/simulation-commerce/package.json modules/simulation-commerce/manifest.json ./
COPY modules/simulation-commerce/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="steward.simulation.commerce" steward.module.version="1.0.2" steward.module.sdk="1"
CMD ["node","dist/index.js"]
