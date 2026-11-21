# Build context: repository root (npm workspaces).
FROM node:26-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/
RUN npm ci -w @quantforge/api --include-workspace-root=false
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN npx prisma generate && npm run build

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /repo/apps/api
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/prisma.config.ts /repo/apps/api/package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
