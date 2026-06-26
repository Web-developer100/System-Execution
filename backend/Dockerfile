# =============================================================================
# V8 Neural Exploitation Platform — FastAPI Backend
# =============================================================================
# Multi-stage production Dockerfile
#
# Stages:
#   1. build — install deps
#   2. production — minimal runtime image
#
# Usage:
#   docker build -f backend/Dockerfile -t v8platform/api-server:latest .
#   docker run -p 8000:8000 v8platform/api-server:latest

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM python:3.12-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash v8

WORKDIR /app

COPY --from=build /root/.local /root/.local
COPY --from=build /app /app

ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/app:$PYTHONPATH
ENV PYTHONUNBUFFERED=1

COPY . .

RUN mkdir -p /data/reports /data/logs && chown -R v8:v8 /data

USER v8

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health/healthz || exit 1

# Use gunicorn with uvicorn workers for production
CMD ["gunicorn", "app.main:app", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120", "--keep-alive", "65", "--max-requests", "10000", "--max-requests-jitter", "1000"]
