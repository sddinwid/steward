FROM node:24.13.0-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools
RUN npm ci && npm run build -w @steward/module-sdk
COPY modules/operations ./modules/operations
RUN cd modules/operations && npm ci && npm run build && npm prune --omit=dev
RUN npm prune --omit=dev
FROM node:24.13.0-alpine
WORKDIR /app/modules/operations
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/module-sdk /app/packages/module-sdk
COPY --from=build /app/modules/operations/node_modules ./node_modules
COPY --from=build /app/modules/operations/dist ./dist
COPY modules/operations/package.json ./package.json
COPY modules/operations/migrations ./migrations
COPY modules/operations/manifest.json ./manifest.json
USER 1000:1000
EXPOSE 8080
LABEL steward.module.id="cee.operations" steward.module.version="1.0.0" steward.module.sdk="1"
CMD ["node", "dist/index.js"]
