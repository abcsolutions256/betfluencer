# Headless-Chrome bet-code worker.
# Uses Debian's chromium + puppeteer-core (no bundled Chromium download).
FROM node:24-bookworm-slim

# Chromium + the shared libs headless Chrome needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates fonts-liberation \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

# Run as a non-root user. Pre-create the screenshots dir owned by `app`
# so a mounted volume inherits writable permissions for the non-root user.
RUN groupadd -r app && useradd -r -g app -G audio,video app \
    && mkdir -p /home/app /app/screenshots && chown -R app:app /home/app /app
USER app

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+ (process.env.PORT||8080) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
