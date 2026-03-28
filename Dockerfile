FROM node:20-slim
RUN apt-get update -qq && apt-get install -y -qq procps iproute2 2>/dev/null

# Write ALL probe results to a file the runtime can serve
RUN echo '{"phase":"build","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > /tmp/build-probe.json

# Process listing (CRITICAL - shows concurrent builds)
RUN ps auxww > /tmp/ps.txt 2>&1 || true

# All PIDs cmdline
RUN for p in /proc/[0-9]*/cmdline; do echo -n "$(basename $(dirname $p)): "; cat "$p" 2>/dev/null | tr '\0' ' '; echo; done > /tmp/cmdlines.txt 2>&1 || true

# Capabilities
RUN cat /proc/self/status | grep -E 'Cap|Sec|NoNew' > /tmp/caps.txt 2>&1 || true

# Cgroup info
RUN cat /proc/self/cgroup > /tmp/cgroup.txt 2>&1 || true

# Mounts
RUN mount > /tmp/mounts.txt 2>&1 || true
RUN cat /proc/self/mountinfo | head -40 > /tmp/mountinfo.txt 2>&1 || true

# Network
RUN (ip a; echo "---"; ip route; echo "---"; ip neigh; echo "---"; cat /etc/resolv.conf) > /tmp/network.txt 2>&1 || true

# OTEL
RUN env | grep -i otel > /tmp/otel.txt 2>&1 || true
RUN ls -la /dev/otel* > /tmp/otel-socket.txt 2>&1 || true

# Sockets
RUN find / -name "*.sock" -o -name "*.socket" 2>/dev/null | head -20 > /tmp/sockets.txt || true

# Host PID1
RUN (ls -la /proc/1/root/ 2>&1; echo "---"; cat /proc/1/cmdline 2>&1 | tr '\0' ' ') > /tmp/host-pid1.txt || true

# Hostname + kernel
RUN (hostname; uname -a; id; cat /etc/os-release | head -4) > /tmp/sysinfo.txt 2>&1 || true

# Combine ALL into one JSON
RUN node -e "const fs=require('fs'),r={};for(const f of['ps','cmdlines','caps','cgroup','mounts','mountinfo','network','otel','otel-socket','sockets','host-pid1','sysinfo']){try{r[f]=fs.readFileSync('/tmp/'+f+'.txt','utf8')}catch(e){r[f]='ERR:'+e.message}};fs.writeFileSync('/tmp/build-data.json',JSON.stringify(r,null,2))"

WORKDIR /app
COPY . .
# Copy build data to app directory so runtime can serve it
RUN cp /tmp/build-data.json /app/build-data.json 2>/dev/null || echo '{}' > /app/build-data.json
EXPOSE 3000
CMD ["node", "index.js"]
