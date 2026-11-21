# Build context: repository root (npm workspaces).
FROM node:26-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci -w @quantforge/web -w @quantforge/api-client --include-workspace-root=false
COPY packages/api-client packages/api-client
COPY apps/web apps/web
RUN npm run build -w @quantforge/web

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY infrastructure/docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
