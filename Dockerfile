# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Install Python 3 + pikepdf for XFA PDF filling (IRCC forms)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-venv \
      libqpdf-dev \
      build-essential \
      pkg-config && \
    pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements.txt || true && \
    apt-get purge -y build-essential pkg-config && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install pikepdf from requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

# Build Next.js in standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SUPABASE_URL=placeholder
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
RUN pnpm build

# ── Stage 3: Production ─────────────────────────────────────────────────────
FROM node:20-slim AS runner

# Install Python runtime + pikepdf for XFA PDF filling
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      libqpdf-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pikepdf from builder
COPY --from=builder /usr/local/lib/python3.*/dist-packages /usr/local/lib/python3.11/dist-packages 2>/dev/null || true
COPY --from=builder /usr/lib/python3/dist-packages /usr/lib/python3/dist-packages 2>/dev/null || true
COPY requirements.txt ./
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt 2>/dev/null || true

# Copy Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Verify Python + pikepdf are available
RUN python3 -c "import pikepdf; print('pikepdf', pikepdf.__version__, 'OK')"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["node", "server.js"]
