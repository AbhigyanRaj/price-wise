# syntax=docker/dockerfile:1

# Built from the REPOSITORY ROOT, for the same workspace reason as the backend.
FROM oven/bun:1.3.14-alpine AS deps

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------

FROM deps AS build

COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

# Same origin as the app in the compose network, so the browser calls
# /api/... and the static server proxies it to the backend. That keeps the auth
# cookies first-party, exactly as the Vite dev proxy does, and avoids needing
# the cross-site SameSite=None path just to run locally.
ENV VITE_API_URL=/api
RUN cd apps/frontend && bun run build

# ---------------------------------------------------------------------------

FROM nginx:1.29-alpine AS runtime

COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173
