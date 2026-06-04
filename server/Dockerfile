# Mimir API/proxy server — build context is the repo root.
#   docker build -f server/Dockerfile -t mimir-server .

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY server/package.json server/tsconfig.json ./
RUN npm install
COPY server/src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-alpine
# docker-cli lets the Glue engine launch sibling containers via the mounted
# host docker socket; bash is used inside those job/kernel containers.
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
