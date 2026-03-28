FROM node:20-slim
RUN echo "SLEEPER BUILD STARTED $(date)" && sleep 180 && echo "SLEEPER DONE"
WORKDIR /app
COPY . .
CMD ["node", "-e", "require('http').createServer((q,r)=>r.end('sleeper')).listen(3000)"]
