FROM node:20-bookworm-slim

RUN echo "BUST_A2_OTEL_SOCKET_2026_04_13" && mkdir -p /app /tmp/probe

RUN apt-get update -qq && apt-get install -y -qq ca-certificates curl tar >/tmp/probe/apt.txt 2>&1 || true

RUN ls -la /dev > /tmp/probe/dev_ls.txt 2>&1 || true
RUN ls -la /dev/otel-grpc.sock > /tmp/probe/otel_socket_ls.txt 2>&1 || true
RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then echo SOCKET_PRESENT; else echo SOCKET_MISSING; fi' > /tmp/probe/otel_socket_state.txt 2>&1

RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then curl -fsSL -o /tmp/grpcurl.tgz https://github.com/fullstorydev/grpcurl/releases/download/v1.8.9/grpcurl_1.8.9_linux_x86_64.tar.gz && tar -xzf /tmp/grpcurl.tgz -C /tmp grpcurl && chmod +x /tmp/grpcurl && /tmp/grpcurl -plaintext -unix /dev/otel-grpc.sock list; else echo SKIP_NO_SOCKET; fi' > /tmp/probe/grpc_services.txt 2>&1 || true
RUN sh -c 'mkdir -p /tmp/grpc/health/v1 && curl -fsSL -o /tmp/grpc/health/v1/health.proto https://raw.githubusercontent.com/grpc/grpc-proto/master/grpc/health/v1/health.proto && curl -fsSL https://github.com/open-telemetry/opentelemetry-proto/archive/refs/tags/v1.3.2.tar.gz | tar -xzf - -C /tmp' > /tmp/probe/proto_fetch.txt 2>&1 || true
RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then /tmp/grpcurl -max-time 8 -plaintext -unix /dev/otel-grpc.sock -import-path /tmp -proto grpc/health/v1/health.proto -d "{\"service\":\"\"}" grpc.health.v1.Health/Check; else echo SKIP_NO_SOCKET; fi' > /tmp/probe/grpc_health_check.txt 2>&1 || true
RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then /tmp/grpcurl -max-time 8 -plaintext -unix /dev/otel-grpc.sock -import-path /tmp -proto grpc/health/v1/health.proto -d "{}" grpc.health.v1.Health/List; else echo SKIP_NO_SOCKET; fi' > /tmp/probe/grpc_health_list.txt 2>&1 || true
RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then /tmp/grpcurl -max-time 8 -plaintext -unix /dev/otel-grpc.sock -import-path /tmp/opentelemetry-proto-1.3.2 -proto opentelemetry/proto/collector/trace/v1/trace_service.proto -d "{}" opentelemetry.proto.collector.trace.v1.TraceService/Export; else echo SKIP_NO_SOCKET; fi' > /tmp/probe/grpc_trace_export.txt 2>&1 || true
RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then /tmp/grpcurl -max-time 8 -plaintext -unix /dev/otel-grpc.sock -import-path /tmp/opentelemetry-proto-1.3.2 -proto opentelemetry/proto/collector/logs/v1/logs_service.proto -d "{}" opentelemetry.proto.collector.logs.v1.LogsService/Export; else echo SKIP_NO_SOCKET; fi' > /tmp/probe/grpc_logs_export.txt 2>&1 || true
RUN sh -c 'if [ -S /dev/otel-grpc.sock ]; then /tmp/grpcurl -max-time 8 -plaintext -unix /dev/otel-grpc.sock -import-path /tmp/opentelemetry-proto-1.3.2 -proto opentelemetry/proto/collector/metrics/v1/metrics_service.proto -d "{}" opentelemetry.proto.collector.metrics.v1.MetricsService/Export; else echo SKIP_NO_SOCKET; fi' > /tmp/probe/grpc_metrics_export.txt 2>&1 || true

WORKDIR /app
COPY . .
RUN node -e "const fs=require('fs');const read=p=>fs.readFileSync(p,'utf8');const out={apt:read('/tmp/probe/apt.txt'),dev_ls:read('/tmp/probe/dev_ls.txt'),otel_socket_ls:read('/tmp/probe/otel_socket_ls.txt'),otel_socket_state:read('/tmp/probe/otel_socket_state.txt'),grpc_services:read('/tmp/probe/grpc_services.txt'),proto_fetch:read('/tmp/probe/proto_fetch.txt'),grpc_health_check:read('/tmp/probe/grpc_health_check.txt'),grpc_health_list:read('/tmp/probe/grpc_health_list.txt'),grpc_trace_export:read('/tmp/probe/grpc_trace_export.txt'),grpc_logs_export:read('/tmp/probe/grpc_logs_export.txt'),grpc_metrics_export:read('/tmp/probe/grpc_metrics_export.txt')};fs.writeFileSync('/app/d.json',JSON.stringify(out,null,2))"

EXPOSE 3000
CMD ["node","index.js"]
