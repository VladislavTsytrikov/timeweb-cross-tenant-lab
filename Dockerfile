FROM node:20-bookworm-slim

RUN echo "BUST_A2_OTEL_SOCKET_2026_04_13" && mkdir -p /app /tmp/probe

RUN apt-get update -qq && apt-get install -y -qq ca-certificates curl tar >/tmp/probe/apt.txt 2>&1 || true

RUN ls -la /dev > /tmp/probe/dev_ls.txt 2>&1 || true
RUN ls -la /dev/otel-grpc.sock > /tmp/probe/otel_socket_ls.txt 2>&1 || true
RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then echo SOCKET_PRESENT; else echo SOCKET_MISSING; fi' > /tmp/probe/otel_socket_state.txt 2>&1

RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then curl -fsSL -o /tmp/grpcurl.tgz https://github.com/fullstorydev/grpcurl/releases/download/v1.8.9/grpcurl_1.8.9_linux_x86_64.tar.gz && tar -xzf /tmp/grpcurl.tgz -C /tmp grpcurl && chmod +x /tmp/grpcurl && /tmp/grpcurl -plaintext -unix /dev/otel-grpc.sock list; else echo SKIP_NO_SOCKET; fi' > /tmp/probe/grpc_services.txt 2>&1 || true

WORKDIR /app
COPY . .
RUN node -e "const fs=require('fs');const out={apt:fs.readFileSync('/tmp/probe/apt.txt','utf8'),dev_ls:fs.readFileSync('/tmp/probe/dev_ls.txt','utf8'),otel_socket_ls:fs.readFileSync('/tmp/probe/otel_socket_ls.txt','utf8'),otel_socket_state:fs.readFileSync('/tmp/probe/otel_socket_state.txt','utf8'),grpc_services:fs.readFileSync('/tmp/probe/grpc_services.txt','utf8')};fs.writeFileSync('/app/d.json',JSON.stringify(out,null,2))"

EXPOSE 3000
CMD ["node","index.js"]
