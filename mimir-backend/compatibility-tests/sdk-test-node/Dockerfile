FROM node:22-slim
WORKDIR /app

COPY package*.json ./
RUN npm install --no-fund --no-audit

COPY tsconfig.json vitest.config.ts ./
COPY tests/ tests/

ENV MIMIR_ENDPOINT=http://mimir:4566
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV TEST_RESULTS_DIR=/results

RUN mkdir -p /results
ENTRYPOINT ["npm", "test"]
