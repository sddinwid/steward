FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit && npm run build -w @steward/contracts && npm run build -w @steward/mission-kit
COPY modules/employment-pathways ./modules/employment-pathways
RUN cd modules/employment-pathways && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/employment-pathways
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/packages/contracts /app/packages/contracts
COPY --from=build /app/packages/mission-kit /app/packages/mission-kit
COPY --from=build /app/modules/employment-pathways/node_modules ./node_modules
COPY --from=build /app/modules/employment-pathways/dist ./dist
COPY modules/employment-pathways/package.json modules/employment-pathways/manifest.json ./
COPY modules/employment-pathways/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="steward.employment.pathways" steward.module.version="1.0.0" steward.module.sdk="1"
CMD ["node","dist/index.js"]
