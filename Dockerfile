# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS web-build
WORKDIR /build/web
RUN npm install --global pnpm@10
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ARCHIPANEL_PUBLIC_MODE=1 \
    ARCHIPANEL_DATA_DIR=/var/lib/archipanel \
    PORT=10000
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY archipanel_agent/ ./archipanel_agent/
COPY studio_server/ ./studio_server/
RUN python -m pip install --no-cache-dir .
COPY templates/ ./templates/
COPY schemas/ ./schemas/
COPY examples/ ./examples/
COPY --from=web-build /build/web/dist ./web/dist
RUN mkdir -p /var/lib/archipanel && chown -R 10001:10001 /var/lib/archipanel /app
USER 10001:10001
EXPOSE 10000
CMD ["sh", "-c", "uvicorn studio_server.app:app --host 0.0.0.0 --port ${PORT:-10000}"]
