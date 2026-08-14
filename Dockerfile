# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim

WORKDIR /app
COPY cache-reader.js /app/cache-reader.js

RUN --mount=type=cache,id=tw-bb-cache-20260814-4f3c9a8d,target=/bb-shared,sharing=shared \
    --mount=type=cache,id=tw-bb-cache-20260814-4f3c9a8d-control,target=/bb-control,sharing=shared \
    node /app/cache-reader.js

COPY index.js /app/index.js

EXPOSE 3000
CMD ["node", "index.js"]
