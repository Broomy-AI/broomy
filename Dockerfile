# Dockerfile for running Broomy E2E tests on Linux
# Uses Xvfb to provide a virtual display for Electron
#
# Usage:
#   ./run-linux-e2e.sh          # build + run all E2E tests
#   ./run-linux-e2e.sh --shell  # drop into container for debugging

FROM node:18-bookworm

# Electron / Chromium runtime dependencies + Xvfb for headless display
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    # Display
    xvfb \
    # Electron / Chromium shared libs
    libgtk-3-0 \
    libgbm1 \
    libnss3 \
    libasound2 \
    libxss1 \
    libxtst6 \
    libx11-xcb1 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libpango-1.0-0 \
    libcairo2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc-s1 \
    libglib2.0-0 \
    libnspr4 \
    libstdc++6 \
    libxcb1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    # node-pty build deps
    python3 \
    make \
    gcc \
    g++ \
    # Useful for debugging
    procps \
    x11-utils \
    # Screenshot tools
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package manifests + scripts needed by postinstall
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/postinstall.cjs scripts/

# Install dependencies (native modules compile here for Linux)
RUN pnpm install --frozen-lockfile

# Copy the rest of the project
COPY . .

# Build the full app (main + preload + renderer)
# Renderer build (Monaco editor) needs extra heap on arm64 emulation
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# Xvfb display config
ENV DISPLAY=:99
ENV ELECTRON_DISABLE_GPU=true
ENV ELECTRON_NO_SANDBOX=true

# Create output directory for screenshots
RUN mkdir -p /output

# Default: start Xvfb and run E2E tests
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["test"]
