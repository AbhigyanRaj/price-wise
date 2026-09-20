# syntax=docker/dockerfile:1

# Built from the REPOSITORY ROOT, not from this directory: the backend imports
# @pricewise/shared through a Bun workspace link, which only resolves if the
# install runs at the workspace root. docker-compose.yml sets the context
# accordingly.
FROM oven/bun:1.3.14-alpine AS deps

WORKDIR /app

# Only the manifests first, so a source-only change does not invalidate the
# install layer.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------

FROM deps AS build

COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Mandatory. Prisma 7 emits its client into apps/backend/src/generated, which is
# gitignored and therefore absent from the build context, so nothing can even
# import it until this runs.
#
# DATABASE_URL is set to a throwaway value because prisma.config.ts is evaluated
# for every command including generate, which needs no database at all.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN cd apps/backend && bunx --bun prisma generate

# ---------------------------------------------------------------------------

FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app

# wget for the healthcheck; the alpine base has neither it nor curl.
RUN apk add --no-cache wget

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/backend ./apps/backend

ENV NODE_ENV=production
EXPOSE 4000

# Migrate then seed then serve, as one command, so `docker compose up` on a
# clean clone produces a populated app rather than an empty one.
#
# The seed truncates before inserting, which is safe here because compose
# recreates the container from the same image every time and the volume holds
# only what this line put there. It is deliberately NOT in the Render
# deployment, where a redeploy mid-session would wipe a reviewer's work.
CMD ["sh", "-c", "cd apps/backend && bunx --bun prisma migrate deploy && bun run src/scripts/seed.ts && bun src/server.ts"]
