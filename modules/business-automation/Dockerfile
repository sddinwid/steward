FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit
COPY modules/business-automation ./modules/business-automation
RUN cd modules/business-automation && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/business-automation
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/modules/business-automation/node_modules ./node_modules
COPY --from=build /app/modules/business-automation/dist ./dist
COPY modules/business-automation/package.json modules/business-automation/manifest.json ./
COPY modules/business-automation/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="steward.automation" steward.module.version="1.0.0" steward.module.sdk="1"
CMD ["node","dist/index.js"]
