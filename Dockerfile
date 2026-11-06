# syntax=docker/dockerfile:1
# One image for every environment (on-premise machine, Azure VM, any container host).
# Runtime configuration:  -e MDR_ASSETS_BASE_URL=https://cdn.example.com/mobila/  -e MDR_MODEL_TIER=auto
# The generated models/snapshots in public/ are part of the build context (run `pnpm assets` beforehand
# when products change); the raw source models in assets/ are not needed.

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.30-alpine
COPY deploy/nginx/mobila-de-romania.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/nginx/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
# Tolerate Windows (CRLF) checkouts: a CR after the shebang makes the entrypoint hook "not found".
RUN sed -i 's/\r$//' /etc/nginx/conf.d/default.conf /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /var/www/mobila-de-romania
EXPOSE 80
