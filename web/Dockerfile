# Mimir web console — build context is the repo root.
#   docker build -f web/Dockerfile -t mimir-web .

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- serve ----
FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
