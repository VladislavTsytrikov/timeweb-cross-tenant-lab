# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim

WORKDIR /app

RUN --mount=type=cache,id=tw-bb-cache-20260814-4f3c9a8d,target=/bb-cache,sharing=shared \
    sh -eu -c 'printf %s TWBB-A-20260814-4f3c9a8d > /bb-cache/bb-canary-4f3c9a8d.txt; printf "%s\n" "{\"marker\":\"BB_CACHE_WRITER_A\",\"cacheId\":\"tw-bb-cache-20260814-4f3c9a8d\",\"write\":true,\"canaryLength\":24}"'

COPY index.js /app/index.js

EXPOSE 3000
CMD ["node", "index.js"]
