FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit
COPY modules/marketing ./modules/marketing
RUN cd modules/marketing && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/marketing
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/catalog-kit /app/packages/catalog-kit
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/packages/commerce-kit /app/packages/commerce-kit
COPY --from=build /app/modules/marketing/node_modules ./node_modules
COPY --from=build /app/modules/marketing/dist ./dist
COPY modules/marketing/package.json modules/marketing/manifest.json ./
COPY modules/marketing/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="cee.marketing" steward.module.version="1.0.3" steward.module.sdk="1"
CMD ["node","dist/index.js"]
