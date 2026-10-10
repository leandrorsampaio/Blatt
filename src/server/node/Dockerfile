# Blatt server -- Docker image for any host (VPS, Fly, Render, Railway, a home server…)
#
# Build from the repository root (it needs cv.html):
#   docker build -f src/server/node/Dockerfile -t blatt .
# Run (settings: src/server/README.md):
#   docker run -d -p 8080:8080 -v blatt-data:/data --env-file blatt.env blatt

FROM node:22-alpine

WORKDIR /app
COPY cv.html ./cv.html
COPY src/server/core.mjs ./src/server/core.mjs
COPY src/server/node/server.mjs ./src/server/node/server.mjs

ENV HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    APP_HTML=/app/cv.html

RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "src/server/node/server.mjs"]
