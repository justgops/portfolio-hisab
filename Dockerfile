# Static PWA: build with Node, serve with nginx. No server, no database; all data stays in each user's browser.
# Same Coolify flow as fabric-costing-lite, but a plain static container instead of Express.

FROM node:22-alpine AS build
WORKDIR /app
# git needed: the ui-kit dependency is installed straight from GitHub, not the npm registry.
RUN apk add --no-cache git
# Manifests first so the install layer is cached until dependencies change. .npmrc carries legacy-peer-deps.
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
# --include=dev: the build needs vite/tsc even if NODE_ENV=production is set at build time.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
