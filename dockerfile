FROM node:18-slim

# Install dependencies untuk Chromium/Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libxrandr2 \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libx11-6 \
    libxcb1 \
    libxi6 \
    libxtst6 \
    libcups2 \
    fonts-liberation \
    libappindicator3-1 \
    libpango-1.0-0 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dan install dependencies Node
COPY package*.json ./
RUN npm install

# Copy seluruh kode
COPY . .

# Environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PORT=3000

# Expose port
EXPOSE 3000

# Jalankan bot
CMD ["node", "index.js"]