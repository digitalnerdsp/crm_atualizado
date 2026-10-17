ARG BUILDPLATFORM=linux/amd64

FROM --platform=$BUILDPLATFORM node:20.20.2-alpine AS build-deps

ENV PNPM_HOME=/pnpm \
  PATH=/pnpm:$PATH

RUN corepack enable && \
  corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/email/package.json ./packages/email/
COPY packages/libs/package.json ./packages/libs/
COPY packages/permissions/package.json ./packages/permissions/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN --mount=type=cache,id=nortys-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store && \
  pnpm config set package-import-method copy && \
  HUSKY=0 pnpm install --prod --frozen-lockfile --ignore-scripts

FROM build-deps AS shared-builder

COPY packages/typescript-config ./packages/typescript-config
COPY packages/email ./packages/email
COPY packages/libs ./packages/libs
COPY packages/permissions ./packages/permissions
COPY i18n ./i18n

WORKDIR /app/packages/email
RUN pnpm run build

WORKDIR /app/packages/permissions
RUN pnpm run build

FROM shared-builder AS api-builder

COPY apps/api /app/apps/api

WORKDIR /app/apps/api
RUN pnpm run build

FROM shared-builder AS web-builder

COPY apps/web /app/apps/web

WORKDIR /app/apps/web
RUN pnpm run build

FROM node:20.20.2-alpine AS runtime

RUN apk add --no-cache nginx=~1.28.3 && \
  addgroup -g 1001 appuser && \
  adduser -u 1001 -G appuser -D appuser && \
  mkdir -p /app /app/data/uploads /var/cache/nginx /var/run/nginx /var/log/nginx /var/lib/nginx/logs /var/lib/nginx/tmp /usr/share/nginx/html /docker-entrypoint.d && \
  chown -R appuser:appuser /app /app/data/uploads /var/cache/nginx /var/run/nginx /var/log/nginx /var/lib/nginx /usr/share/nginx/html /docker-entrypoint.d && \
  touch /var/run/nginx.pid && \
  chown appuser:appuser /var/run/nginx.pid && \
  printf 'worker_processes auto;\nerror_log /var/log/nginx/error.log warn;\npid /var/run/nginx.pid;\nevents { worker_connections 1024; }\nhttp {\n  include /etc/nginx/mime.types;\n  default_type application/octet-stream;\n  include /etc/nginx/conf.d/*.conf;\n}\n' > /etc/nginx/nginx.conf

WORKDIR /app

COPY --from=api-builder --chown=appuser:appuser /app/apps/api/dist /app/apps/api/dist
COPY --from=api-builder --chown=appuser:appuser /app/apps/api/drizzle /app/apps/api/drizzle

RUN node --check /app/apps/api/dist/index.js

COPY --from=web-builder --chown=appuser:appuser /app/apps/web/dist /usr/share/nginx/html
COPY --chown=appuser:appuser apps/web/nginx.nortys.conf /etc/nginx/conf.d/default.conf
RUN chown -R appuser:appuser /etc/nginx/conf.d
COPY --chown=appuser:appuser apps/web/env.sh /docker-entrypoint.d/env.sh
COPY --chown=appuser:appuser deploy/nortys-entrypoint.sh /usr/local/bin/nortys-entrypoint.sh

RUN chmod +x /docker-entrypoint.d/env.sh /usr/local/bin/nortys-entrypoint.sh

ENV NODE_ENV=production \
  FILE_STORAGE_DRIVER=local \
  LOCAL_UPLOAD_DIR=/app/data/uploads

USER appuser
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5173/api/health || exit 1

CMD ["/usr/local/bin/nortys-entrypoint.sh"]
