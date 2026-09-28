FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system syllo && useradd --system --gid syllo --home-dir /app syllo

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --requirement /tmp/requirements.txt

COPY backend /app/backend
RUN chmod +x /app/backend/docker-entrypoint.sh && chown -R syllo:syllo /app

USER syllo
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/live', timeout=3)" || exit 1

ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
