FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit
COPY modules/procurement ./modules/procurement
RUN cd modules/procurement && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/procurement
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/modules/procurement/node_modules ./node_modules
COPY --from=build /app/modules/procurement/dist ./dist
COPY modules/procurement/package.json modules/procurement/manifest.json ./
COPY modules/procurement/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="cee.procurement" steward.module.version="1.1.0" steward.module.sdk="1"
CMD ["node","dist/index.js"]
