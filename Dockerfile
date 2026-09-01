# Notizbuch (OneNote-MD v2) — Docker image for Unraid
FROM node:22-alpine

WORKDIR /app

# Install unzip for .zip OneNote export imports
RUN apk add --no-cache unzip

# Copy package files and install deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy application
COPY server ./server
COPY public ./public

# Data directory (notes + imports) as a volume for Unraid persistence
RUN mkdir -p /app/data/notes /app/data/imports /app/data/.tmp-upload

ENV PORT=3500
ENV NOTES_ROOT=/app/data/notes
ENV DATA_DIR=/app/data

EXPOSE 3500

# Use a volume so Unraid can map to a host path (e.g. /mnt/user/appdata/onenote)
VOLUME ["/app/data"]

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3500/ || exit 1

CMD ["node", "server/server.js"]
