FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk && npm run build -w @steward/business-kit && npm run build -w @steward/commerce-kit && npm run build -w @steward/simulation-kit
COPY modules/sales ./modules/sales
RUN cd modules/sales && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/sales
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/packages/business-kit /app/packages/business-kit
COPY --from=build /app/packages/commerce-kit /app/packages/commerce-kit
COPY --from=build /app/packages/simulation-kit /app/packages/simulation-kit
COPY --from=build /app/modules/sales/node_modules ./node_modules
COPY --from=build /app/modules/sales/dist ./dist
COPY modules/sales/package.json modules/sales/manifest.json ./
COPY modules/sales/migrations ./migrations
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="cee.sales" steward.module.version="1.3.0" steward.module.sdk="1"
CMD ["node","dist/index.js"]
