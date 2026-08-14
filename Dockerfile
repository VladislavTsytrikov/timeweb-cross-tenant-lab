FROM node:20-bookworm-slim

WORKDIR /app
COPY . .

# Безопасный proof: создать block node из свежего mountinfo и только открыть
# его с O_NONBLOCK, не читая ни одного байта. Контроль использует 511:511.
RUN node /app/build-probe.js

EXPOSE 3000
CMD ["node", "index.js"]
