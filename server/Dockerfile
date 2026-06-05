# Mimir API/proxy server — build context is the repo root.
#   docker build -f server/Dockerfile -t mimir-server .

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
# Use bundled Node headers so node-gyp doesn't try to fetch them over HTTPS.
ENV npm_config_nodedir=/usr/local
# node-pty is a native addon — needs a toolchain to compile against musl.
# Switch repos to HTTP first to work around corporate proxy TLS interception.
RUN sed -i 's/https/http/' /etc/apk/repositories \
 && apk add --no-cache python3 make g++ linux-headers
COPY server/package.json server/tsconfig.json ./
RUN npm install
COPY server/src ./src
RUN npm run build

# Pull the docker CLI binary from the official image (avoids apk TLS issues).
FROM docker:27-cli AS docker-source

# ---- runtime ----
FROM node:20-alpine
ENV npm_config_nodedir=/usr/local
# docker-cli lets the Glue engine launch sibling containers via the mounted
# host docker socket and powers the EC2 terminal (docker exec); bash is used
# inside those job/kernel containers.
COPY --from=docker-source /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app
COPY server/package.json ./
# Compile native deps (node-pty) with a throwaway toolchain, then drop it so
# the runtime image stays small.
RUN sed -i 's/https/http/' /etc/apk/repositories \
 && apk add --no-cache --virtual .build python3 make g++ linux-headers \
 && npm install --omit=dev && npm cache clean --force \
 && apk del .build
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
